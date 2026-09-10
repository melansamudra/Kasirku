import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import {
  PERIOD_COOKIE_NAME,
  PERIOD_DESCRIPTIONS,
  addDaysStr,
  getPeriodRange,
  parsePeriod,
  wibStartOfDay,
} from "../../../reports/period";
import PeriodTabs from "../../../reports/period-tabs";
import KartuStokList, { type KartuStokRow } from "./kartu-stok-list";
import { hasStockLocationAccess } from "@/lib/cost-control/has-stock-access";
import { todayWibDateString } from "@/lib/wib";

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function LocationKartuStokPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string; tab?: string; date?: string }>;
}) {
  const { businessId, locationId } = await params;
  const { period: periodParam, from, to, tab: tabParam, date: dateParam } = await searchParams;
  const activeTab: "kartu-stok" | "rekonsil" = tabParam === "rekonsil" ? "rekonsil" : "kartu-stok";
  const cookieStore = await cookies();
  const period = parsePeriod(periodParam ?? cookieStore.get(PERIOD_COOKIE_NAME)?.value);
  const { fromIso, toIsoExclusive } = getPeriodRange(period, from, to);
  const rekonsilDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "") ? (dateParam as string) : todayWibDateString();
  const base = `/business/${businessId}/lokasi/${locationId}/kartu-stok`;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, stock_locations_enabled, rich_stock_ops_enabled")
    .eq("id", businessId)
    .single();
  if (!business || !hasStockLocationAccess(business)) {
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

  const [
    adjustments,
    { data: ingredientStocks },
    { data: semiStocks },
    { data: opnameEntries },
    { data: locationSectionRows },
    { data: ingredientSectionRows },
    { data: semiFinishedSectionRows },
  ] = await Promise.all([
    fetchAllRows<{
      ingredient_id: string | null;
      semi_finished_item_id: string | null;
      item_name: string;
      unit: string | null;
      diff: number;
    }>((rangeFrom, rangeTo) => {
      // Stok Data/Stok Riil di bawah tetap real-time (saldo & opname
      // terakhir SAAT INI), cuma Stock Masuk/Keluar yang difilter periode --
      // dua hal beda: saldo itu "sekarang", pergerakan itu "sepanjang
      // periode yang dipilih".
      let q = supabase
        .from("stock_adjustments")
        .select("ingredient_id, semi_finished_item_id, item_name, unit, diff")
        .eq("business_id", businessId)
        .eq("location_id", locationId);
      if (fromIso) q = q.gte("entry_date", fromIso.slice(0, 10));
      if (toIsoExclusive) q = q.lt("entry_date", toIsoExclusive.slice(0, 10));
      return q.range(rangeFrom, rangeTo);
    }),
    supabase
      .from("ingredient_location_stock")
      .select("ingredient_id, stock, ingredients(name, unit)")
      .eq("business_id", businessId)
      .eq("location_id", locationId),
    supabase
      .from("semi_finished_item_location_stock")
      .select("semi_finished_item_id, stock, semi_finished_items(name, unit)")
      .eq("business_id", businessId)
      .eq("location_id", locationId),
    supabase
      .from("stock_opname_entries")
      .select("ingredient_id, semi_finished_item_id, reported_stock, status, entry_date")
      .eq("business_id", businessId)
      .eq("location_id", locationId)
      .order("created_at", { ascending: false }),
    supabase.from("stock_location_opname_sections").select("section_id").eq("business_id", businessId).eq("location_id", locationId),
    supabase.from("ingredient_opname_section_items").select("ingredient_id, section_id").eq("business_id", businessId),
    supabase.from("semi_finished_item_opname_section_items").select("semi_finished_item_id, section_id").eq("business_id", businessId),
  ]);

  // Lokasi diikat ke Bagian tertentu (sama pola dengan halaman Bahan Baku) --
  // baris bahan baku MAUPUN BSJ ikut dipangkas supaya konsisten dengan
  // daftar yang tampil di Bahan Baku / Bahan Setengah Jadi.
  const locationSectionIds = (locationSectionRows ?? []).map((r) => r.section_id);
  const sectionIdsByIngredient = new Map<string, string[]>();
  for (const row of ingredientSectionRows ?? []) {
    const list = sectionIdsByIngredient.get(row.ingredient_id) ?? [];
    list.push(row.section_id);
    sectionIdsByIngredient.set(row.ingredient_id, list);
  }
  const sectionIdsBySemiFinished = new Map<string, string[]>();
  for (const row of semiFinishedSectionRows ?? []) {
    const list = sectionIdsBySemiFinished.get(row.semi_finished_item_id) ?? [];
    list.push(row.section_id);
    sectionIdsBySemiFinished.set(row.semi_finished_item_id, list);
  }

  function filterBySection(items: KartuStokRow[]): KartuStokRow[] {
    return locationSectionIds.length > 0
      ? items.filter((r) => {
          const itemSectionIds =
            r.componentType === "ingredient"
              ? (sectionIdsByIngredient.get(r.id) ?? [])
              : (sectionIdsBySemiFinished.get(r.id) ?? []);
          return itemSectionIds.some((id) => locationSectionIds.includes(id));
        })
      : items;
  }

  const rows = new Map<string, KartuStokRow>();

  function ensureRow(key: string, name: string, unit: string, componentType: "ingredient" | "semi_finished", id: string) {
    if (!rows.has(key)) {
      rows.set(key, {
        key,
        id,
        componentType,
        name,
        unit,
        stokData: 0,
        stockMasuk: 0,
        stockKeluar: 0,
        lastOpname: null,
      });
    }
    return rows.get(key)!;
  }

  for (const s of ingredientStocks ?? []) {
    const ing = s.ingredients as unknown as { name: string; unit: string } | null;
    if (!ing) continue;
    const row = ensureRow(`ing:${s.ingredient_id}`, ing.name, ing.unit, "ingredient", s.ingredient_id);
    row.stokData = Number(s.stock);
  }
  for (const s of semiStocks ?? []) {
    const item = s.semi_finished_items as unknown as { name: string; unit: string } | null;
    if (!item) continue;
    const row = ensureRow(`semi:${s.semi_finished_item_id}`, item.name, item.unit, "semi_finished", s.semi_finished_item_id);
    row.stokData = Number(s.stock);
  }

  for (const a of adjustments) {
    const key = a.ingredient_id ? `ing:${a.ingredient_id}` : `semi:${a.semi_finished_item_id}`;
    const id = a.ingredient_id ?? a.semi_finished_item_id ?? "";
    const componentType = a.ingredient_id ? "ingredient" : "semi_finished";
    const row = ensureRow(key, a.item_name, a.unit ?? "", componentType, id);
    const diff = Number(a.diff);
    if (diff > 0) row.stockMasuk += diff;
    else row.stockKeluar += Math.abs(diff);
  }

  for (const o of opnameEntries ?? []) {
    const key = o.ingredient_id ? `ing:${o.ingredient_id}` : `semi:${o.semi_finished_item_id}`;
    const row = rows.get(key);
    // Baris pertama yang ketemu per key = paling baru (sudah order by
    // created_at desc), sisanya (opname lama) dilewati.
    if (row && !row.lastOpname) {
      row.lastOpname = {
        reportedStock: Number(o.reported_stock),
        status: o.status as "pending" | "verified" | "rejected",
        entryDate: o.entry_date,
      };
    }
  }

  const list = filterBySection([...rows.values()]).sort((a, b) => a.name.localeCompare(b.name));

  // Rekonsil Stok Harian per lokasi: BUKAN filter data yang ada, tapi hitung
  // mundur dari saldo LIVE sekarang di lokasi ini -- sama konsep dengan versi
  // global (stock-opname/page.tsx), cuma nunjuk ke tabel per-lokasi
  // (ingredient_location_stock, stock_opname_entries) dan konsumsi penjualan
  // difilter transaction_ingredient_consumption.location_id = lokasi ini
  // (baru terisi sejak location-scoped sales patch, lihat migration
  // 20260910160000 dst). Baru bahan baku -- BSJ belum tercakup, karena
  // konsumsi BSJ dari penjualan juga belum pernah tercatat ke
  // stock_adjustments sama sekali (gap terpisah, di luar scope ini).
  let rekonsilRows: KartuStokRow[] = [];
  if (activeTab === "rekonsil") {
    const dayStartIso = wibStartOfDay(rekonsilDate);
    const nextDayStartIso = wibStartOfDay(addDaysStr(rekonsilDate, 1));

    const [adjFromDate, consOnDay, consAfterDay, opnameOnDate] = await Promise.all([
      fetchAllRows<{ ingredient_id: string | null; entry_date: string; diff: number }>((rf, rt) =>
        supabase
          .from("stock_adjustments")
          .select("ingredient_id, entry_date, diff")
          .eq("business_id", businessId)
          .eq("location_id", locationId)
          .not("ingredient_id", "is", null)
          .gte("entry_date", rekonsilDate)
          .range(rf, rt),
      ),
      fetchAllRows<{ ingredient_id: string; qty: number }>((rf, rt) =>
        supabase
          .from("transaction_ingredient_consumption")
          .select("ingredient_id, qty, transactions!inner(business_id, date, voided)")
          .eq("transactions.business_id", businessId)
          .eq("location_id", locationId)
          .eq("transactions.voided", false)
          .gte("transactions.date", dayStartIso)
          .lt("transactions.date", nextDayStartIso)
          .range(rf, rt),
      ),
      fetchAllRows<{ ingredient_id: string; qty: number }>((rf, rt) =>
        supabase
          .from("transaction_ingredient_consumption")
          .select("ingredient_id, qty, transactions!inner(business_id, date, voided)")
          .eq("transactions.business_id", businessId)
          .eq("location_id", locationId)
          .eq("transactions.voided", false)
          .gte("transactions.date", nextDayStartIso)
          .range(rf, rt),
      ),
      supabase
        .from("stock_opname_entries")
        .select("ingredient_id, reported_stock, status, entry_date")
        .eq("business_id", businessId)
        .eq("location_id", locationId)
        .eq("entry_date", rekonsilDate)
        .not("ingredient_id", "is", null)
        .order("created_at", { ascending: false }),
    ]);

    const rekonsilMap = new Map<string, KartuStokRow & { afterDate: number }>();
    for (const s of ingredientStocks ?? []) {
      const ing = s.ingredients as unknown as { name: string; unit: string } | null;
      if (!ing) continue;
      rekonsilMap.set(s.ingredient_id, {
        key: `ing:${s.ingredient_id}`,
        id: s.ingredient_id,
        componentType: "ingredient",
        name: ing.name,
        unit: ing.unit,
        stokData: Number(s.stock),
        stockMasuk: 0,
        stockKeluar: 0,
        lastOpname: null,
        afterDate: 0,
      });
    }
    for (const a of adjFromDate) {
      if (!a.ingredient_id) continue;
      const row = rekonsilMap.get(a.ingredient_id);
      if (!row) continue;
      const diff = Number(a.diff);
      if (a.entry_date === rekonsilDate) {
        if (diff > 0) row.stockMasuk += diff;
        else row.stockKeluar += Math.abs(diff);
      } else {
        row.afterDate += diff;
      }
    }
    for (const c of consOnDay) {
      const row = rekonsilMap.get(c.ingredient_id);
      if (row) row.stockKeluar += Number(c.qty);
    }
    for (const c of consAfterDay) {
      const row = rekonsilMap.get(c.ingredient_id);
      if (row) row.afterDate -= Number(c.qty);
    }
    for (const o of opnameOnDate.data ?? []) {
      if (!o.ingredient_id) continue;
      const row = rekonsilMap.get(o.ingredient_id);
      if (row && !row.lastOpname) {
        row.lastOpname = {
          reportedStock: Number(o.reported_stock),
          status: o.status as "pending" | "verified" | "rejected",
          entryDate: o.entry_date,
        };
      }
    }

    rekonsilRows = filterBySection(
      [...rekonsilMap.values()].map((r) => ({ ...r, stokData: r.stokData - r.afterDate })),
    ).sort((a, b) => a.name.localeCompare(b.name));
  }

  return (
    <div className="w-full max-w-3xl">
      <Link
        href={`/business/${businessId}/lokasi/${locationId}/bahan-baku`}
        className="text-xs text-zinc-400 hover:text-brand-600"
      >
        ← {location.name}
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Kartu Stok — {location.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {activeTab === "kartu-stok"
              ? `Stock Masuk/Keluar: ${PERIOD_DESCRIPTIONS[period]}`
              : "Saldo bahan baku persis di akhir tanggal yang dipilih, dihitung mundur dari saldo sekarang."}
          </p>
        </div>
        <div className="flex shrink-0 rounded-xl bg-zinc-100 p-1 text-xs font-semibold">
          <Link
            href={base}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              activeTab === "kartu-stok" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Kartu Stok
          </Link>
          <Link
            href={`${base}?tab=rekonsil`}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              activeTab === "rekonsil" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Rekonsil Stok Harian
          </Link>
        </div>
      </div>

      {activeTab === "kartu-stok" ? (
        <>
          <p className="mt-2 text-xs text-zinc-400">
            Stok Data (sistem) & Stok Riil (opname terakhir) selalu saldo terkini. Stock Masuk/Keluar
            mengikuti periode yang dipilih.
          </p>
          <div className="mt-2">
            <PeriodTabs basePath={base} period={period} />
          </div>

          {period === "custom" && (
            <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-white shadow-sm p-4">
              <input type="hidden" name="period" value="custom" />
              <label className="text-xs font-medium text-zinc-600">
                Dari
                <input
                  type="date"
                  name="from"
                  defaultValue={from}
                  className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-zinc-600">
                Sampai
                <input
                  type="date"
                  name="to"
                  defaultValue={to}
                  className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
              >
                Terapkan
              </button>
            </form>
          )}

          <div className="mt-4">
            <KartuStokList items={list} />
          </div>
        </>
      ) : (
        <>
          <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-white shadow-sm p-4">
            <input type="hidden" name="tab" value="rekonsil" />
            <label className="text-xs font-medium text-zinc-600">
              Tanggal
              <input
                type="date"
                name="date"
                defaultValue={rekonsilDate}
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
          <p className="mt-2 text-[11px] text-zinc-400">
            Stok Data dihitung persis di akhir tanggal {formatDate(rekonsilDate)} (bukan saldo hari ini). Stok
            Riil & Selisih diambil dari hasil opname yang tercatat di tanggal itu juga di lokasi ini. Bahan
            Setengah Jadi belum tercakup di tab ini.
          </p>
          <div className="mt-4">
            <KartuStokList items={rekonsilRows} />
          </div>
        </>
      )}
    </div>
  );
}
