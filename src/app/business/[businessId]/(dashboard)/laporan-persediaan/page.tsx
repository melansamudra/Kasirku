import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeAllSemiFinishedItemCosts } from "@/lib/cost-control/compute-cost";
import { hasStockLocationAccess } from "@/lib/cost-control/has-stock-access";
import { todayWibDateString } from "@/lib/wib";
import PersediaanTable, { type PersediaanRow } from "./persediaan-table";
import PrintButton from "./print-button";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export default async function LaporanPersediaanPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, stock_locations_enabled, rich_stock_ops_enabled")
    .eq("id", businessId)
    .single();

  if (!business || !hasStockLocationAccess(business)) {
    notFound();
  }

  const [{ data: ingredients }, { data: ingredientStockRows }, { data: semiItems }, { data: semiStockRows }, costMap] =
    await Promise.all([
      supabase
        .from("ingredients")
        .select("id, name, unit, unit_cost")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase.from("ingredient_location_stock").select("ingredient_id, stock").eq("business_id", businessId),
      supabase
        .from("semi_finished_items")
        .select("id, name, unit")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("semi_finished_item_location_stock")
        .select("semi_finished_item_id, stock")
        .eq("business_id", businessId),
      computeAllSemiFinishedItemCosts(supabase, businessId),
    ]);

  // Stok bahan baku dilacak per lokasi fisik (ingredient_location_stock),
  // BUKAN kolom ingredients.stock lama -- laporan per divisi menjumlahkan
  // stok di SEMUA lokasi milik bisnis ini (satu divisi bisa punya beberapa
  // lokasi, mis. Gudang Utama + Dapur Produksi).
  const ingredientStockById = new Map<string, number>();
  for (const row of ingredientStockRows ?? []) {
    ingredientStockById.set(row.ingredient_id, (ingredientStockById.get(row.ingredient_id) ?? 0) + Number(row.stock));
  }
  const semiStockById = new Map<string, number>();
  for (const row of semiStockRows ?? []) {
    semiStockById.set(
      row.semi_finished_item_id,
      (semiStockById.get(row.semi_finished_item_id) ?? 0) + Number(row.stock),
    );
  }

  const bahanBakuRows: PersediaanRow[] = (ingredients ?? []).map((i) => {
    const stock = ingredientStockById.get(i.id) ?? 0;
    const unitCost = Number(i.unit_cost);
    return { id: i.id, name: i.name, unit: i.unit, stock, unitCost, total: stock * unitCost };
  });
  const bsjRows: PersediaanRow[] = (semiItems ?? []).map((i) => {
    const stock = semiStockById.get(i.id) ?? 0;
    const unitCost = costMap.get(i.id)?.unitCost ?? 0;
    return { id: i.id, name: i.name, unit: i.unit, stock, unitCost, total: stock * unitCost };
  });

  const subtotalBahanBaku = bahanBakuRows.reduce((s, r) => s + r.total, 0);
  const subtotalBsj = bsjRows.reduce((s, r) => s + r.total, 0);
  const grandTotal = subtotalBahanBaku + subtotalBsj;

  const todayLabel = new Date(`${todayWibDateString()}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="w-full max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-2 print:hidden">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Laporan Persediaan — {business.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Posisi stok per item &times; harga per unit saat ini, sebagai nilai persediaan barang
            pada tanggal {todayLabel}.
          </p>
        </div>
        <PrintButton />
      </div>
      <div className="hidden print:block">
        <h1 className="text-lg font-bold text-zinc-900">Laporan Persediaan — {business.name}</h1>
        <p className="text-xs text-zinc-500">Posisi per {todayLabel}</p>
      </div>

      <div className="mt-4 rounded-xl bg-brand-50 p-4 print:mt-2 print:rounded-none print:bg-transparent print:border print:border-zinc-300">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700 print:text-zinc-500">
          Total Nilai Persediaan
        </p>
        <p className="mt-1 text-2xl font-bold text-zinc-900">{formatRupiah(grandTotal)}</p>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Bahan Baku {formatRupiah(subtotalBahanBaku)} + Bahan Setengah Jadi {formatRupiah(subtotalBsj)}
        </p>
      </div>

      <PersediaanTable title="Bahan Baku" rows={bahanBakuRows} subtotal={subtotalBahanBaku} />
      <PersediaanTable title="Bahan Setengah Jadi" rows={bsjRows} subtotal={subtotalBsj} />
    </div>
  );
}
