import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import StockOpnameLinkBox from "./link-box";
import DirectOpnameForm from "./direct-opname-form";
import { VerifyEntryButtons, VerifyAllButton } from "./verify-buttons";
import { submitLocationStockOpnameDirect, submitWarehouseStockOpnameDirect } from "./actions";
import { hasStockLocationAccess } from "@/lib/cost-control/has-stock-access";
import { todayWibDateString } from "@/lib/wib";

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

function formatQty(value: number) {
  return Number(value).toLocaleString("id-ID");
}

function daysAgoBadge(dateStr: string) {
  const entry = new Date(`${dateStr}T00:00:00Z`);
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const days = Math.round((todayUtc.getTime() - entry.getTime()) / 86400000);

  if (days <= 0) return { label: "Hari ini", tone: "neutral" as const };
  if (days === 1) return { label: "Kemarin", tone: "neutral" as const };
  if (days <= 2) return { label: `${days} hari lalu`, tone: "neutral" as const };
  return { label: `Terlambat ${days} hari belum diverifikasi`, tone: "danger" as const };
}

export default async function LocationStockOpnamePage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
  searchParams: Promise<{ bagian?: string; tab?: string; date?: string }>;
}) {
  const { businessId, locationId } = await params;
  const { bagian: bagianParam, tab: tabParam, date: dateParam } = await searchParams;
  const activeTab: "opname" | "nilai" = tabParam === "nilai" ? "nilai" : "opname";
  const nilaiDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "") ? (dateParam as string) : todayWibDateString();
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select(
      "id, name, cost_control_enabled, stock_locations_enabled, rich_stock_ops_enabled, stock_opname_slug, location_scoped_sales_enabled",
    )
    .eq("id", businessId)
    .single();
  if (!business || !hasStockLocationAccess(business)) {
    notFound();
  }
  const costControlUiEnabled = Boolean(business.cost_control_enabled || business.rich_stock_ops_enabled);

  const { data: location } = await supabase
    .from("stock_locations")
    .select("id, name, is_default_purchase, is_production, warehouse_mode")
    .eq("id", locationId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!location) {
    notFound();
  }

  // Gudang standalone (lihat migrasi warehouse_stock_opname) -- barangnya
  // warehouse_items, bukan ingredients, jadi opname-nya selalu form
  // langsung (tidak ada link publik/Bagian, itu konsep khusus ingredients).
  const isStandaloneWarehouse =
    location.is_default_purchase && !location.is_production && location.warehouse_mode === "standalone";

  // Tab "Nilai Persediaan": stok per bahan MUNDUR ke tanggal yang dipilih
  // (sama konsep hitung mundur dengan Rekonsil Stok Harian di Kartu Stok),
  // dikali unit_cost -- belum didukung buat Gudang standalone (warehouse_items
  // belum punya kolom harga).
  type NilaiRow = { id: string; name: string; unit: string; stock: number; unitCost: number; value: number };
  let nilaiRows: NilaiRow[] = [];
  if (activeTab === "nilai" && !isStandaloneWarehouse) {
    const dayStartIso = new Date(`${nilaiDate}T00:00:00+07:00`).toISOString();
    const nextDay = new Date(`${nilaiDate}T00:00:00+07:00`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const nextDayStartIso = nextDay.toISOString();

    const [ingredientRows, { data: stockRows }, adjAfterDate, consAfterDate] = await Promise.all([
      fetchAllRows<{ id: string; name: string; unit: string; unit_cost: number }>((from, to) =>
        supabase
          .from("ingredients")
          .select("id, name, unit, unit_cost")
          .eq("business_id", businessId)
          .is("deleted_at", null)
          .range(from, to),
      ),
      supabase
        .from("ingredient_location_stock")
        .select("ingredient_id, stock")
        .eq("business_id", businessId)
        .eq("location_id", locationId),
      fetchAllRows<{ ingredient_id: string | null; diff: number }>((rf, rt) =>
        supabase
          .from("stock_adjustments")
          .select("ingredient_id, diff")
          .eq("business_id", businessId)
          .eq("location_id", locationId)
          .not("ingredient_id", "is", null)
          .gt("entry_date", nilaiDate)
          .range(rf, rt),
      ),
      business.location_scoped_sales_enabled
        ? fetchAllRows<{ ingredient_id: string; qty: number }>((rf, rt) =>
            supabase
              .from("transaction_ingredient_consumption")
              .select("ingredient_id, qty, transactions!inner(business_id, date, voided)")
              .eq("transactions.business_id", businessId)
              .eq("location_id", locationId)
              .eq("transactions.voided", false)
              .gte("transactions.date", nextDayStartIso)
              .range(rf, rt),
          )
        : Promise.resolve([]),
    ]);

    const afterDateByIngredient = new Map<string, number>();
    for (const a of adjAfterDate) {
      if (!a.ingredient_id) continue;
      afterDateByIngredient.set(a.ingredient_id, (afterDateByIngredient.get(a.ingredient_id) ?? 0) + Number(a.diff));
    }
    for (const c of consAfterDate) {
      afterDateByIngredient.set(c.ingredient_id, (afterDateByIngredient.get(c.ingredient_id) ?? 0) - Number(c.qty));
    }

    const currentStockByIngredient = new Map((stockRows ?? []).map((r) => [r.ingredient_id, Number(r.stock)]));
    nilaiRows = ingredientRows
      .map((i) => {
        const current = currentStockByIngredient.get(i.id) ?? 0;
        const stock = current - (afterDateByIngredient.get(i.id) ?? 0);
        const unitCost = Number(i.unit_cost) || 0;
        return { id: i.id, name: i.name, unit: i.unit, stock, unitCost, value: stock * unitCost };
      })
      .filter((r) => Math.abs(r.stock) > 0.001)
      .sort((a, b) => b.value - a.value);
  }
  const nilaiTotal = nilaiRows.reduce((s, r) => s + r.value, 0);

  let directWarehouseItems: { id: string; name: string; unit: string; currentStock: number }[] = [];
  if (isStandaloneWarehouse) {
    const { data: items } = await supabase
      .from("warehouse_items")
      .select("id, name, unit, stock")
      .eq("business_id", businessId)
      .eq("location_id", locationId)
      .order("name", { ascending: true });
    directWarehouseItems = (items ?? []).map((i) => ({ id: i.id, name: i.name, unit: i.unit, currentStock: Number(i.stock) }));
  }

  let directIngredients: { id: string; name: string; unit: string; currentStock: number }[] = [];
  let locationSections: { id: string; name: string }[] = [];
  let selectedSectionId: string | null = null;
  if (!costControlUiEnabled && !isStandaloneWarehouse) {
    const [ingredientRows, { data: stockRows }, { data: locationSectionRows }, { data: sectionItemRows }] =
      await Promise.all([
        fetchAllRows((from, to) =>
          supabase
            .from("ingredients")
            .select("id, name, unit")
            .eq("business_id", businessId)
            .is("deleted_at", null)
            .order("name", { ascending: true })
            .range(from, to),
        ),
        supabase
          .from("ingredient_location_stock")
          .select("ingredient_id, stock")
          .eq("business_id", businessId)
          .eq("location_id", locationId),
        // Bagian yang ditandai "termasuk lokasi ini" (diatur dari halaman
        // Bahan Baku, "Bagian Lokasi Ini") -- dipakai buat mempersempit
        // daftar bahan di form opname, sama tujuannya dengan yang sudah ada
        // di Bahan Baku/Kartu Stok, tapi sebelumnya BELUM diterapkan di
        // halaman Stok Opname ini sama sekali (form-nya selalu nampilin
        // SEMUA bahan bisnis, keluhan user: 331 bahan sekaligus).
        supabase
          .from("stock_location_opname_sections")
          .select("section_id, ingredient_opname_sections(id, name)")
          .eq("business_id", businessId)
          .eq("location_id", locationId),
        supabase
          .from("ingredient_opname_section_items")
          .select("ingredient_id, section_id")
          .eq("business_id", businessId),
      ]);

    locationSections = (locationSectionRows ?? [])
      .map((r) => r.ingredient_opname_sections as unknown as { id: string; name: string } | null)
      .filter((s): s is { id: string; name: string } => !!s)
      .sort((a, b) => a.name.localeCompare(b.name));

    selectedSectionId =
      bagianParam && locationSections.some((s) => s.id === bagianParam) ? bagianParam : null;

    const sectionIdsByIngredient = new Map<string, string[]>();
    for (const row of sectionItemRows ?? []) {
      const list = sectionIdsByIngredient.get(row.ingredient_id) ?? [];
      list.push(row.section_id);
      sectionIdsByIngredient.set(row.ingredient_id, list);
    }

    const stockByIngredient = new Map((stockRows ?? []).map((r) => [r.ingredient_id, Number(r.stock)]));
    directIngredients = ingredientRows
      .filter((i) => !selectedSectionId || (sectionIdsByIngredient.get(i.id) ?? []).includes(selectedSectionId))
      .map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        currentStock: stockByIngredient.get(i.id) ?? 0,
      }));
  }

  const [{ data: pendingEntries }, { data: adjustments }] = await Promise.all([
    supabase
      .from("stock_opname_entries")
      .select("id, item_name, unit, reported_stock, system_stock_at_report, submitted_by_name, entry_date, created_at")
      .eq("business_id", businessId)
      .eq("location_id", locationId)
      .eq("status", "pending")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("stock_adjustments")
      .select("id, item_name, unit, stock_before, stock_after, diff, entry_date, submitted_by_name, created_at")
      .eq("business_id", businessId)
      .eq("location_id", locationId)
      .eq("reason", "Stok opname")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const pendingByDate = new Map<string, typeof pendingEntries>();
  for (const row of pendingEntries ?? []) {
    const list = pendingByDate.get(row.entry_date) ?? [];
    list.push(row);
    pendingByDate.set(row.entry_date, list);
  }

  const verifiedByDate = new Map<string, typeof adjustments>();
  for (const row of adjustments ?? []) {
    const list = verifiedByDate.get(row.entry_date) ?? [];
    list.push(row);
    verifiedByDate.set(row.entry_date, list);
  }

  return (
    <div className="w-full max-w-2xl">
      <Link
        href={`/business/${businessId}/lokasi/${locationId}/bahan-baku`}
        className="text-xs text-zinc-400 hover:text-brand-600"
      >
        ← {location.name}
      </Link>
      <h1 className="mt-2 text-lg font-bold text-zinc-900">Stok Opname — {location.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {activeTab === "opname"
          ? "Laporan stok fisik dari staf menunggu diverifikasi dulu sebelum mengubah stok sistem."
          : `Stok & nilai persediaan per bahan di ${location.name}, mundur ke tanggal yang dipilih.`}
      </p>

      <div className="mt-3 flex shrink-0 rounded-xl bg-zinc-100 p-1 text-xs font-semibold w-fit">
        <Link
          href={`/business/${businessId}/lokasi/${locationId}/stock-opname`}
          className={`rounded-lg px-3 py-1.5 transition-colors ${
            activeTab === "opname" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          Catat Opname
        </Link>
        <Link
          href={`/business/${businessId}/lokasi/${locationId}/stock-opname?tab=nilai`}
          className={`rounded-lg px-3 py-1.5 transition-colors ${
            activeTab === "nilai" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          Nilai Persediaan
        </Link>
      </div>

      {activeTab === "nilai" ? (
        isStandaloneWarehouse ? (
          <p className="mt-4 rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Nilai Persediaan belum didukung untuk Gudang mode &quot;Berdiri Sendiri&quot; -- barang Gudang di sini
            belum punya kolom harga.
          </p>
        ) : (
          <div className="mt-4">
            <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl bg-white shadow-sm p-4">
              <input type="hidden" name="tab" value="nilai" />
              <label className="text-xs font-medium text-zinc-600">
                Tanggal
                <input
                  type="date"
                  name="date"
                  defaultValue={nilaiDate}
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
                Total Nilai Persediaan — {formatDate(nilaiDate)}
              </p>
              <p className="mt-1 text-2xl font-bold text-zinc-900">{formatRupiah(nilaiTotal)}</p>
            </div>

            <div className="mt-3 overflow-hidden rounded-xl bg-white shadow-sm">
              {nilaiRows.length > 0 ? (
                <div className="divide-y divide-zinc-100">
                  {nilaiRows.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-zinc-800">{r.name}</p>
                        <p className="text-[10.5px] text-zinc-400">
                          {formatQty(r.stock)} {r.unit} &times; {formatRupiah(r.unitCost)}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold text-zinc-900">{formatRupiah(r.value)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-8 text-center text-xs text-zinc-400">
                  Tidak ada stok bahan baku di lokasi ini pada tanggal tersebut.
                </p>
              )}
            </div>
          </div>
        )
      ) : isStandaloneWarehouse ? (
        <DirectOpnameForm
          ingredients={directWarehouseItems}
          action={submitWarehouseStockOpnameDirect.bind(null, businessId, locationId)}
          label="barang"
        />
      ) : costControlUiEnabled ? (
        <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Link Stok Opname</h2>
          <div className="mt-3">
            <StockOpnameLinkBox
              businessId={businessId}
              locationId={locationId}
              initialSlug={business.stock_opname_slug ?? ""}
            />
          </div>
        </div>
      ) : (
        <>
          {locationSections.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={`/business/${businessId}/lokasi/${locationId}/stock-opname`}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  !selectedSectionId ? "bg-brand-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                Semua Bagian
              </a>
              {locationSections.map((s) => (
                <a
                  key={s.id}
                  href={`/business/${businessId}/lokasi/${locationId}/stock-opname?bagian=${s.id}`}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    selectedSectionId === s.id ? "bg-brand-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  {s.name}
                </a>
              ))}
            </div>
          )}
          <DirectOpnameForm
            ingredients={directIngredients}
            action={submitLocationStockOpnameDirect.bind(null, businessId, locationId)}
          />
        </>
      )}

      {activeTab === "opname" && pendingByDate.size > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-bold text-amber-700">⏳ Menunggu Verifikasi</h2>
          <div className="space-y-4">
            {[...pendingByDate.entries()].map(([date, rows]) => {
              const badge = daysAgoBadge(date);
              return (
              <div key={date} className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/40">
                <div className="flex items-center justify-between border-b border-amber-200 px-4 py-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-zinc-900">{formatDate(date)}</h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          badge.tone === "danger" ? "bg-red-100 text-red-700" : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500">{rows!.length} bahan dilaporkan</p>
                  </div>
                  <VerifyAllButton businessId={businessId} locationId={locationId} entryDate={date} count={rows!.length} />
                </div>
                <div className="divide-y divide-amber-100 bg-white">
                  {rows!.map((r) => {
                    const selisih = Number(r.reported_stock) - Number(r.system_stock_at_report);
                    return (
                      <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-zinc-800">{r.item_name}</p>
                          <p className="text-[10.5px] text-zinc-400">
                            Stok Data: {formatQty(Number(r.system_stock_at_report))} {r.unit} · Stok Riil:{" "}
                            {formatQty(Number(r.reported_stock))} {r.unit} · Selisih{" "}
                            <span className={selisih === 0 ? "text-zinc-400" : selisih > 0 ? "text-brand-600" : "text-red-500"}>
                              {selisih > 0 ? "+" : ""}
                              {formatQty(selisih)}
                            </span>{" "}
                            · {r.submitted_by_name}
                          </p>
                        </div>
                        <VerifyEntryButtons businessId={businessId} locationId={locationId} entryId={r.id} />
                      </div>
                    );
                  })}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "opname" && (
      <div className="mt-6 space-y-4">
        <h2 className="text-sm font-bold text-zinc-900">Riwayat Terverifikasi</h2>
        {verifiedByDate.size > 0 ? (
          [...verifiedByDate.entries()].map(([date, rows]) => (
            <div key={date} className="overflow-hidden rounded-xl bg-white shadow-sm">
              <div className="border-b border-zinc-100 px-4 py-3">
                <h3 className="text-sm font-bold text-zinc-900">{formatDate(date)}</h3>
                <p className="text-[11px] text-zinc-400">{rows!.length} bahan disesuaikan</p>
              </div>
              <div className="divide-y divide-zinc-100">
                {rows!.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-zinc-800">{r.item_name}</p>
                      <p className="text-[10.5px] text-zinc-400">
                        {formatQty(Number(r.stock_before))} → {formatQty(Number(r.stock_after))} {r.unit}
                        {r.submitted_by_name ? ` · ${r.submitted_by_name}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 font-semibold ${
                        Number(r.diff) > 0 ? "text-brand-600" : "text-red-500"
                      }`}
                    >
                      {Number(r.diff) > 0 ? "+" : ""}
                      {formatQty(Number(r.diff))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-xs text-zinc-400">
            Belum ada riwayat stok opname terverifikasi di lokasi ini.
          </p>
        )}
      </div>
      )}
    </div>
  );
}
