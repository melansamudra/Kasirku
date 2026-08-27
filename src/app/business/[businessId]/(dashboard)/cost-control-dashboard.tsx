import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeAllSemiFinishedItemCosts } from "@/lib/cost-control/compute-cost";

// Dashboard KHUSUS business dengan cost_control_enabled (dapur pusat semacam
// Lauk Nusantara) — tidak jual lewat POS sama sekali, jadi dashboard "Total
// Pendapatan/Laba/Margin" ala kasir (lihat page.tsx) tidak relevan di sini.
// Fokusnya: stok bahan setengah jadi, permintaan resto yang perlu ditindak,
// dan riwayat produksi — cerminan grup nav "Produksi & Distribusi".

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatRupiahShort(value: number) {
  if (value >= 1_000_000) return `Rp${(value / 1_000_000).toFixed(1)} Jt`;
  if (value >= 1_000) return `Rp${Math.round(value / 1_000)} Rb`;
  return formatRupiah(value);
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CostControlDashboard({ businessId }: { businessId: string }) {
  const supabase = await createClient();
  const base = `/business/${businessId}`;

  const [
    { data: items },
    { count: finishedCount },
    { count: outletCount },
    { count: pendingRequestCount },
    { count: pendingWarehouseRequestCount },
    { data: recentRuns },
    { data: stockLocations },
    costMap,
  ] = await Promise.all([
    supabase
      .from("semi_finished_items")
      .select("id, name, unit, stock, min_stock")
      .eq("business_id", businessId)
      .is("deleted_at", null),
    supabase
      .from("finished_products")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .is("deleted_at", null),
    supabase
      .from("outlets")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("active", true),
    supabase
      .from("outlet_requests")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "baru"),
    supabase
      .from("warehouse_requests")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "baru"),
    supabase
      .from("production_runs")
      .select("id, item_name, qty_produced, unit, unit_cost, total_cost, produced_by_name, produced_at")
      .eq("business_id", businessId)
      .eq("voided", false)
      .order("produced_at", { ascending: false })
      .limit(5),
    supabase
      .from("stock_locations")
      .select("id, name")
      .eq("business_id", businessId)
      .order("sort_order", { ascending: true }),
    computeAllSemiFinishedItemCosts(supabase, businessId),
  ]);

  const semiItems = items ?? [];
  const stockValue = semiItems.reduce(
    (sum, item) => sum + Number(item.stock) * (costMap.get(item.id)?.unitCost ?? 0),
    0,
  );

  // Nilai bahan baku per lokasi fisik (Gudang Utama/Kitchen Atas/dst) --
  // stok per lokasi (ingredient_location_stock) dikali unit_cost bahan baku
  // itu sendiri (harga bahan baku business-wide, bukan per lokasi).
  let locationValues: { id: string; name: string; value: number }[] = [];
  if ((stockLocations ?? []).length > 0) {
    const [{ data: locStockRows }, { data: allIngredients }] = await Promise.all([
      supabase
        .from("ingredient_location_stock")
        .select("location_id, ingredient_id, stock")
        .eq("business_id", businessId),
      supabase
        .from("ingredients")
        .select("id, unit_cost")
        .eq("business_id", businessId)
        .is("deleted_at", null),
    ]);
    const unitCostById = new Map((allIngredients ?? []).map((i) => [i.id, Number(i.unit_cost)]));
    const valueByLocation = new Map<string, number>();
    for (const row of locStockRows ?? []) {
      const unitCost = unitCostById.get(row.ingredient_id) ?? 0;
      const value = Number(row.stock) * unitCost;
      valueByLocation.set(row.location_id, (valueByLocation.get(row.location_id) ?? 0) + value);
    }
    locationValues = (stockLocations ?? []).map((loc) => ({
      id: loc.id,
      name: loc.name,
      value: valueByLocation.get(loc.id) ?? 0,
    }));
  }
  const totalLocationValue = locationValues.reduce((s, l) => s + l.value, 0);
  const lowStockItems = semiItems
    .filter((item) => Number(item.min_stock) > 0 && Number(item.stock) <= Number(item.min_stock))
    .sort((a, b) => (Number(b.min_stock) - Number(b.stock)) - (Number(a.min_stock) - Number(a.stock)))
    .slice(0, 5);

  const today = new Date().toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Dashboard</h1>
          <p className="mt-0.5 text-xs text-zinc-500">Ringkasan Produksi & Distribusi — {today}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(pendingRequestCount ?? 0) > 0 && (
            <Link
              href={`${base}/permintaan-resto`}
              className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
            >
              ● {pendingRequestCount} permintaan resto menunggu
            </Link>
          )}
          {(pendingWarehouseRequestCount ?? 0) > 0 && (
            <Link
              href={`${base}/permintaan-gudang`}
              className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
            >
              ● {pendingWarehouseRequestCount} permintaan gudang menunggu
            </Link>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href={`${base}/semi-finished-items`} className="rounded-xl bg-white shadow-sm p-4 hover:shadow-md transition-shadow">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">Bahan Setengah Jadi</p>
          <p className="text-xl font-bold text-zinc-900">{semiItems.length}</p>
          <p className="mt-0.5 text-[10.5px] text-zinc-400">item aktif</p>
        </Link>
        <Link href={`${base}/finished-products`} className="rounded-xl bg-white shadow-sm p-4 hover:shadow-md transition-shadow">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">Produk Jadi</p>
          <p className="text-xl font-bold text-zinc-900">{finishedCount ?? 0}</p>
          <p className="mt-0.5 text-[10.5px] text-zinc-400">item aktif</p>
        </Link>
        <Link href={`${base}/outlets`} className="rounded-xl bg-white shadow-sm p-4 hover:shadow-md transition-shadow">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">Outlet Aktif</p>
          <p className="text-xl font-bold text-zinc-900">{outletCount ?? 0}</p>
          <p className="mt-0.5 text-[10.5px] text-zinc-400">resto terdaftar</p>
        </Link>
        <Link
          href={`${base}/permintaan-resto`}
          className="rounded-xl bg-white shadow-sm p-4 hover:shadow-md transition-shadow"
        >
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-400">Permintaan Menunggu</p>
          <p className={`text-xl font-bold ${(pendingRequestCount ?? 0) > 0 ? "text-amber-700" : "text-zinc-900"}`}>
            {pendingRequestCount ?? 0}
          </p>
          <p className="mt-0.5 text-[10.5px] text-zinc-400">perlu ditindak</p>
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Nilai stok */}
        <div className="rounded-xl bg-white shadow-sm p-4">
          <h2 className="text-sm font-bold text-zinc-900">Nilai Stok Bahan Setengah Jadi</h2>
          <p className="mt-0.5 text-[11px] text-zinc-400">Stok saat ini × HPP live per unit</p>
          <p className="mt-4 text-2xl font-bold text-zinc-900">{formatRupiahShort(stockValue)}</p>
          <p className="mt-1 text-xs text-zinc-500">{formatRupiah(stockValue)}</p>
        </div>

        {/* Stok menipis */}
        <div className="rounded-xl bg-white shadow-sm p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-900">Stok Menipis</h2>
            <Link href={`${base}/semi-finished-items`} className="text-[11px] font-medium text-amber-700 hover:underline">
              Lihat semua →
            </Link>
          </div>
          {lowStockItems.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-300">Semua stok aman</p>
          ) : (
            <div className="mt-3 space-y-2">
              {lowStockItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2">
                  <p className="truncate text-xs font-medium text-amber-900">{item.name}</p>
                  <p className="shrink-0 text-xs font-semibold text-amber-700">
                    {Number(item.stock)} / {Number(item.min_stock)} {item.unit}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Nilai bahan baku per lokasi */}
      {locationValues.length > 0 && (
        <div className="mt-4 rounded-xl bg-white shadow-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-zinc-900">Nilai Bahan Baku per Lokasi</h2>
              <p className="mt-0.5 text-[11px] text-zinc-400">Stok per lokasi × harga bahan baku saat ini</p>
            </div>
            <p className="text-sm font-bold text-zinc-900">{formatRupiahShort(totalLocationValue)}</p>
          </div>
          <div className="mt-3 space-y-2">
            {locationValues.map((loc) => {
              const pct = totalLocationValue > 0 ? (loc.value / totalLocationValue) * 100 : 0;
              return (
                <Link
                  key={loc.id}
                  href={`${base}/lokasi/${loc.id}/bahan-baku`}
                  className="block rounded-lg px-3 py-2 hover:bg-zinc-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-zinc-800">{loc.name}</p>
                    <p className="shrink-0 text-xs font-semibold text-zinc-700">{formatRupiah(loc.value)}</p>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Riwayat produksi */}
      <div className="mt-4 rounded-xl bg-white shadow-sm p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-900">Riwayat Produksi Terbaru</h2>
          <Link href={`${base}/produksi`} className="text-[11px] font-medium text-amber-700 hover:underline">
            Lihat semua →
          </Link>
        </div>
        {!recentRuns || recentRuns.length === 0 ? (
          <p className="py-8 text-center text-xs text-zinc-300">Belum ada produksi tercatat</p>
        ) : (
          <div className="mt-3 divide-y divide-zinc-100">
            {recentRuns.map((run) => (
              <div key={run.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-800">{run.item_name}</p>
                  <p className="text-[10.5px] text-zinc-400">
                    {formatDateTime(run.produced_at)} · {run.produced_by_name}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-semibold text-zinc-800">
                    {Number(run.qty_produced)} {run.unit}
                  </p>
                  <p className="text-[10.5px] text-zinc-400">{formatRupiah(Number(run.total_cost))}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`${base}/warehouses`} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50">
          Gudang →
        </Link>
        <Link href={`${base}/semi-finished-items`} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50">
          Bahan Setengah Jadi →
        </Link>
        <Link href={`${base}/finished-products`} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50">
          Produk Jadi (HPP) →
        </Link>
        <Link href={`${base}/produksi`} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50">
          Produksi →
        </Link>
        <Link href={`${base}/outlets`} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50">
          Outlet →
        </Link>
        <Link href={`${base}/permintaan-resto`} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50">
          Permintaan Resto →
        </Link>
        <Link href={`${base}/permintaan-gudang`} className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50">
          Permintaan Gudang →
        </Link>
      </div>
    </div>
  );
}
