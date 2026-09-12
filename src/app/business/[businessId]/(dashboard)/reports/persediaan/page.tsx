import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { hasStockLocationAccess } from "@/lib/cost-control/has-stock-access";
import { todayWibDateString } from "@/lib/wib";
import PersediaanTable, { type PersediaanRow } from "../../laporan-persediaan/persediaan-table";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function ReportsPersediaanPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { businessId } = await params;
  const { date: dateParam } = await searchParams;
  const pickedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "") ? (dateParam as string) : todayWibDateString();
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, stock_locations_enabled, rich_stock_ops_enabled")
    .eq("id", businessId)
    .maybeSingle();
  if (!business) notFound();

  if (!hasStockLocationAccess(business)) {
    return (
      <div className="w-full max-w-3xl">
        <h1 className="text-lg font-bold text-zinc-900">Persediaan</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Laporan ini khusus bisnis dengan stok per lokasi (Kitchen/Bar/Gudang, dst) aktif.
        </p>
      </div>
    );
  }

  const { data: locations } = await supabase
    .from("stock_locations")
    .select("id, name, sort_order, is_default_purchase, is_production, warehouse_mode")
    .eq("business_id", businessId)
    .order("sort_order", { ascending: true });

  const ingredients = await fetchAllRows<{ id: string; name: string; unit: string; unit_cost: number }>(
    (from, to) =>
      supabase
        .from("ingredients")
        .select("id, name, unit, unit_cost")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .range(from, to),
  );

  type LocationSection = { locationId: string; locationName: string; rows: PersediaanRow[]; subtotal: number };
  const sections: LocationSection[] = [];

  for (const location of locations ?? []) {
    const isStandaloneWarehouse =
      location.is_default_purchase && !location.is_production && location.warehouse_mode === "standalone";

    let rows: PersediaanRow[];

    if (isStandaloneWarehouse) {
      const [{ data: warehouseItemRows }, adjAfterDate] = await Promise.all([
        supabase
          .from("warehouse_items")
          .select("id, name, unit, stock, unit_cost")
          .eq("business_id", businessId)
          .eq("location_id", location.id),
        fetchAllRows<{ warehouse_item_id: string | null; diff: number }>((rf, rt) =>
          supabase
            .from("stock_adjustments")
            .select("warehouse_item_id, diff")
            .eq("business_id", businessId)
            .eq("location_id", location.id)
            .not("warehouse_item_id", "is", null)
            .gt("entry_date", pickedDate)
            .range(rf, rt),
        ),
      ]);

      const afterDateByItem = new Map<string, number>();
      for (const a of adjAfterDate) {
        if (!a.warehouse_item_id) continue;
        afterDateByItem.set(a.warehouse_item_id, (afterDateByItem.get(a.warehouse_item_id) ?? 0) + Number(a.diff));
      }

      rows = (warehouseItemRows ?? [])
        .map((i) => {
          const current = Number(i.stock);
          const stock = current - (afterDateByItem.get(i.id) ?? 0);
          const unitCost = Number(i.unit_cost) || 0;
          return { id: i.id, name: i.name, unit: i.unit, stock, unitCost, total: stock * unitCost };
        })
        .filter((r) => Math.abs(r.stock) > 0.001)
        .sort((a, b) => b.total - a.total);
    } else {
      const [{ data: stockRows }, adjAfterDate] = await Promise.all([
        supabase
          .from("ingredient_location_stock")
          .select("ingredient_id, stock")
          .eq("business_id", businessId)
          .eq("location_id", location.id),
        // Catatan: stock_adjustments sudah mencakup deduksi penjualan
        // (reason='Penjualan', ditulis bareng saat checkout -- lihat
        // migration location_scoped_sales_consumption) -- JANGAN ikut
        // kurangi lagi dari transaction_ingredient_consumption di sini,
        // itu cuma log paralel buat COGS, bukan pergerakan stok kedua.
        fetchAllRows<{ ingredient_id: string | null; diff: number }>((rf, rt) =>
          supabase
            .from("stock_adjustments")
            .select("ingredient_id, diff")
            .eq("business_id", businessId)
            .eq("location_id", location.id)
            .not("ingredient_id", "is", null)
            .gt("entry_date", pickedDate)
            .range(rf, rt),
        ),
      ]);

      const afterDateByIngredient = new Map<string, number>();
      for (const a of adjAfterDate) {
        if (!a.ingredient_id) continue;
        afterDateByIngredient.set(a.ingredient_id, (afterDateByIngredient.get(a.ingredient_id) ?? 0) + Number(a.diff));
      }

      const currentStockByIngredient = new Map((stockRows ?? []).map((r) => [r.ingredient_id, Number(r.stock)]));
      rows = ingredients
        .map((i) => {
          const current = currentStockByIngredient.get(i.id) ?? 0;
          const stock = current - (afterDateByIngredient.get(i.id) ?? 0);
          const unitCost = Number(i.unit_cost) || 0;
          return { id: i.id, name: i.name, unit: i.unit, stock, unitCost, total: stock * unitCost };
        })
        .filter((r) => Math.abs(r.stock) > 0.001)
        .sort((a, b) => b.total - a.total);
    }

    const subtotal = rows.reduce((s, r) => s + r.total, 0);
    sections.push({ locationId: location.id, locationName: location.name, rows, subtotal });
  }

  const grandTotal = sections.reduce((s, sec) => s + sec.subtotal, 0);

  return (
    <div className="w-full max-w-3xl">
      <h1 className="text-lg font-bold text-zinc-900">Persediaan — {business.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Nilai persediaan per lokasi, mundur ke tanggal yang dipilih.
      </p>

      <form method="get" className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-white shadow-sm p-4">
        <label className="text-xs font-medium text-zinc-600">
          Tanggal
          <input
            type="date"
            name="date"
            defaultValue={pickedDate}
            max={todayWibDateString()}
            className="mt-1 block rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
        >
          Tampilkan
        </button>
      </form>

      <div className="mt-4 rounded-xl bg-brand-50 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">
          Total Nilai Persediaan — {formatDate(pickedDate)}
        </p>
        <p className="mt-1 text-2xl font-bold text-zinc-900">{formatRupiah(grandTotal)}</p>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {sections.map((s) => `${s.locationName} ${formatRupiah(s.subtotal)}`).join(" + ")}
        </p>
      </div>

      {sections.map((s) => (
        <PersediaanTable key={s.locationId} title={s.locationName} rows={s.rows} subtotal={s.subtotal} />
      ))}

      {sections.length === 0 && (
        <p className="mt-4 text-center text-sm text-zinc-400">Belum ada lokasi stok untuk bisnis ini.</p>
      )}
    </div>
  );
}
