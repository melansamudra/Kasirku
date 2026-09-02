import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { syncFinishedProductsToCatalog } from "@/lib/cost-control/sync-finished-products-catalog";
import ManualTransactionForm from "./manual-transaction-form";

export default async function NewManualTransactionPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, rich_stock_ops_enabled")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  // rich_stock_ops_enabled (Llauk pasca-konversi) SENGAJA TIDAK ikut di sini --
  // katalog jualnya sekarang `products` biasa (sama kaya Adi's), bukan lagi
  // mirror dari `finished_products` -- kalau ikut, sync ini bakal terus
  // membuat ulang produk yang sudah dihapus user tiap halaman ini dibuka.
  const costControlEnabled = business.cost_control_enabled ?? false;

  if (costControlEnabled) {
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
      costControlEnabled
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
          {costControlEnabled ? "Catat Penjualan" : "Transaksi Manual"} — {business.name}
        </h1>
        <Link
          href={`/business/${businessId}/transactions`}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
        >
          ← Kembali
        </Link>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        {costControlEnabled
          ? "Catat penjualan produk jadi dari resto/outlet — dengan tanggal yang bisa diatur bebas."
          : "Catat transaksi tanpa lewat kasir — cocok untuk penjualan yang terlewat dicatat, dengan tanggal yang bisa diatur bebas."}
      </p>

      <div className="mt-6">
        <ManualTransactionForm
          businessId={businessId}
          products={products ?? []}
          customers={customers ?? []}
          customPaymentMethods={(customPaymentMethodRows ?? []).map((m) => m.name)}
          outlets={costControlEnabled ? outlets ?? [] : undefined}
        />
      </div>
    </div>
  );
}
