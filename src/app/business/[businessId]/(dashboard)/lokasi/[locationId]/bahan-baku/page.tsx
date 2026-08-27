import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AdjustStockForm from "@/components/adjust-stock-form";
import { adjustIngredientLocationStock } from "./actions";
import ReceiveFulfillmentButton from "./receive-fulfillment-button";

export default async function LocationBahanBakuPage({
  params,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
}) {
  const { businessId, locationId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled")
    .eq("id", businessId)
    .single();

  if (!business || !business.cost_control_enabled) {
    notFound();
  }

  const { data: location } = await supabase
    .from("stock_locations")
    .select("id, name")
    .eq("id", locationId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!location) {
    notFound();
  }

  const [{ data: ingredients }, { data: stockRows }, { data: adjustments }] = await Promise.all([
    supabase
      .from("ingredients")
      .select("id, name, unit")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("ingredient_location_stock")
      .select("ingredient_id, stock")
      .eq("business_id", businessId)
      .eq("location_id", locationId),
    supabase
      .from("stock_adjustments")
      .select("id, item_name, unit, stock_before, stock_after, diff, reason, created_at")
      .eq("business_id", businessId)
      .eq("location_id", locationId)
      .not("ingredient_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const stockByIngredient = new Map((stockRows ?? []).map((r) => [r.ingredient_id, Number(r.stock)]));

  // "Ambil dari Gudang": Purchasing menandai di Permintaan Barang, lokasi
  // peminta (di sini) yang konfirmasi terima -- baru stok benar-benar pindah
  // saat itu, bukan saat ditandai ("masih harus diinput dulu distock masuk
  // mereka", arahan user 2026-08-27).
  const { data: locationRequests } = await supabase
    .from("purchase_requests")
    .select("id")
    .eq("business_id", businessId)
    .eq("location_id", locationId);
  const locationRequestIds = (locationRequests ?? []).map((r) => r.id);

  let pendingFulfillments: {
    id: string;
    qty: number;
    marked_at: string;
    item_name: string;
    unit: string | null;
  }[] = [];
  let employees: { id: string; name: string }[] = [];

  if (locationRequestIds.length > 0) {
    const [{ data: locationItems }, { data: employeeRows }] = await Promise.all([
      supabase
        .from("purchase_request_items")
        .select("id, item_name, unit")
        .in("purchase_request_id", locationRequestIds),
      supabase.from("employees").select("id, name").eq("business_id", businessId).eq("active", true).order("name"),
    ]);
    employees = employeeRows ?? [];
    const itemIds = (locationItems ?? []).map((it) => it.id);
    const itemById = new Map((locationItems ?? []).map((it) => [it.id, it]));

    if (itemIds.length > 0) {
      const { data: fulfillments } = await supabase
        .from("purchase_request_item_stock_fulfillments")
        .select("id, purchase_request_item_id, qty, marked_at")
        .eq("business_id", businessId)
        .in("purchase_request_item_id", itemIds)
        .is("received_at", null);

      pendingFulfillments = (fulfillments ?? [])
        .map((f) => {
          const item = itemById.get(f.purchase_request_item_id);
          return { id: f.id, qty: Number(f.qty), marked_at: f.marked_at, item_name: item?.item_name ?? "(barang)", unit: item?.unit ?? null };
        })
        .sort((a, b) => a.marked_at.localeCompare(b.marked_at));
    }
  }

  return (
    <div className="w-full max-w-2xl">
      <p className="text-xs text-zinc-400">
        <Link href={`/business/${businessId}/ingredients`} className="hover:text-brand-600 hover:underline">
          Bahan Baku
        </Link>{" "}
        · Stok per Lokasi
      </p>
      <h1 className="mt-1 text-lg font-bold text-zinc-900">
        Bahan Baku — {location.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Stok bahan baku khusus lokasi <strong>{location.name}</strong> — terpisah dari stok bahan
        baku pusat. Daftar bahannya sama (satu master untuk seluruh bisnis), cuma jumlah stoknya
        dilacak sendiri-sendiri per lokasi.
      </p>

      {pendingFulfillments.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-800">📦 Barang dari Gudang Utama — Menunggu Diterima</h2>
          <p className="mt-0.5 text-[11px] text-amber-700">
            Purchasing sudah menandai barang ini diambil dari Gudang Utama untuk lokasi ini. Konfirmasi
            setelah barangnya benar-benar sampai fisik — stok baru pindah ke {location.name} setelah ini.
          </p>
          <div className="mt-3 space-y-2">
            {pendingFulfillments.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2">
                <p className="text-xs font-medium text-zinc-800">
                  {f.item_name} — {f.qty}
                  {f.unit ? ` ${f.unit}` : ""}
                </p>
                <ReceiveFulfillmentButton businessId={businessId} fulfillmentId={f.id} employees={employees} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-2">
        {ingredients && ingredients.length > 0 ? (
          ingredients.map((i) => {
            const stock = stockByIngredient.get(i.id) ?? 0;
            return (
              <div
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">{i.name}</p>
                  <p className="text-xs text-zinc-500">
                    Stok di {location.name}: {stock} {i.unit}
                  </p>
                </div>
                <AdjustStockForm
                  itemName={i.name}
                  currentStock={stock}
                  unit={i.unit}
                  action={adjustIngredientLocationStock.bind(null, businessId, locationId, i.id)}
                />
              </div>
            );
          })
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada bahan baku — tambahkan dulu di halaman Bahan Baku.
          </p>
        )}
      </div>

      {adjustments && adjustments.length > 0 && (
        <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">
            Riwayat Penyesuaian Stok — {location.name}
          </h2>
          <div className="space-y-2">
            {adjustments.map((a) => (
              <div key={a.id} className="border-b border-zinc-100 pb-2 text-xs last:border-0">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-zinc-800">{a.item_name}</p>
                  <p
                    className={
                      Number(a.diff) > 0 ? "font-semibold text-brand-600" : "font-semibold text-red-500"
                    }
                  >
                    {Number(a.diff) > 0 ? "+" : ""}
                    {a.diff} {a.unit}
                  </p>
                </div>
                <p className="text-zinc-500">
                  {a.stock_before} → {a.stock_after} {a.unit} · {a.reason} ·{" "}
                  {new Date(a.created_at).toLocaleString("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
