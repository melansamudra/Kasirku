import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeAllFinishedProductCosts } from "@/lib/cost-control/compute-cost";
import ManualTransactionForm from "./manual-transaction-form";

// Business cost-control (Lauk Nusantara dkk) tidak punya katalog `products`
// POS sama sekali — katalog jualnya adalah `finished_products` (Produk Jadi
// HPP) di modul Produksi & Distribusi. Transaksi Manual pakai RPC
// `create_manual_transaction` yang SENGAJA tidak disentuh (jalur paling
// kritis & paling sering direvisi di seluruh app — lihat komentar migration
// 20260725120000_manual_transactions.sql), jadi solusinya bukan bikin RPC
// baru, tapi cermin `finished_products` aktif ke tabel `products` (ditandai
// category ini) supaya RPC yang sudah ada & teruji bisa dipakai apa adanya.
// Tanpa product_recipes yang ikut dibuat, RPC itu tidak akan mengurangi stok
// bahan baku apa pun — cocok, karena stok bahan sudah berkurang lebih awal
// (saat produksi), bukan saat resto mencatat penjualan produk jadi.
const FINISHED_PRODUCT_MIRROR_CATEGORY = "Produk Jadi (HPP)";

async function syncFinishedProductsToCatalog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
) {
  const [{ data: finishedProducts }, { data: mirrored }, costMap] = await Promise.all([
    supabase
      .from("finished_products")
      .select("id, name, selling_price, target_food_cost_pct")
      .eq("business_id", businessId)
      .is("deleted_at", null),
    supabase
      .from("products")
      .select("id, name, price, cost")
      .eq("business_id", businessId)
      .eq("category", FINISHED_PRODUCT_MIRROR_CATEGORY)
      .is("deleted_at", null),
    computeAllFinishedProductCosts(supabase, businessId),
  ]);

  const activeItems = finishedProducts ?? [];
  const mirroredByName = new Map((mirrored ?? []).map((p) => [p.name, p]));
  const activeNames = new Set(activeItems.map((p) => p.name));

  const toInsert: { business_id: string; name: string; category: string; price: number; cost: number }[] = [];
  const toUpdate: { id: string; price: number; cost: number }[] = [];

  for (const item of activeItems) {
    const unitCost = costMap.get(item.id)?.unitCost ?? 0;
    const suggested =
      item.target_food_cost_pct != null && item.target_food_cost_pct > 0
        ? unitCost / (item.target_food_cost_pct / 100)
        : null;
    const price = Math.round(item.selling_price ?? suggested ?? 0);
    const cost = Math.round(unitCost);

    const existing = mirroredByName.get(item.name);
    if (!existing) {
      toInsert.push({ business_id: businessId, name: item.name, category: FINISHED_PRODUCT_MIRROR_CATEGORY, price, cost });
    } else if (existing.price !== price || existing.cost !== cost) {
      toUpdate.push({ id: existing.id, price, cost });
    }
  }

  const staleIds = (mirrored ?? []).filter((p) => !activeNames.has(p.name)).map((p) => p.id);

  await Promise.all([
    toInsert.length > 0 ? supabase.from("products").insert(toInsert) : null,
    ...toUpdate.map((u) => supabase.from("products").update({ price: u.price, cost: u.cost }).eq("id", u.id)),
    staleIds.length > 0
      ? supabase.from("products").update({ deleted_at: new Date().toISOString() }).in("id", staleIds)
      : null,
  ]);
}

export default async function NewManualTransactionPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  if (business.cost_control_enabled) {
    await syncFinishedProductsToCatalog(supabase, businessId);
  }

  const [{ data: products }, { data: customers }, { data: customPaymentMethodRows }, { data: outlets }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, category, price, stock, variant_label")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("customers")
        .select("id, name, phone")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("custom_payment_methods")
        .select("name")
        .eq("business_id", businessId)
        .order("name", { ascending: true }),
      business.cost_control_enabled
        ? supabase
            .from("outlets")
            .select("id, name")
            .eq("business_id", businessId)
            .eq("active", true)
            .order("name", { ascending: true })
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

  return (
    <div className="w-full max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-zinc-900">
          {business.cost_control_enabled ? "Catat Penjualan" : "Transaksi Manual"} — {business.name}
        </h1>
        <Link
          href={`/business/${businessId}/transactions`}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
        >
          ← Kembali
        </Link>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        {business.cost_control_enabled
          ? "Catat penjualan produk jadi dari resto/outlet — dengan tanggal yang bisa diatur bebas."
          : "Catat transaksi tanpa lewat kasir — cocok untuk penjualan yang terlewat dicatat, dengan tanggal yang bisa diatur bebas."}
      </p>

      <div className="mt-6">
        <ManualTransactionForm
          businessId={businessId}
          products={products ?? []}
          customers={customers ?? []}
          customPaymentMethods={(customPaymentMethodRows ?? []).map((m) => m.name)}
          outlets={business.cost_control_enabled ? outlets ?? [] : undefined}
        />
      </div>
    </div>
  );
}
