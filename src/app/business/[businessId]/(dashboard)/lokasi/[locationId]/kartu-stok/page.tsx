import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { PERIOD_COOKIE_NAME, PERIOD_DESCRIPTIONS, getPeriodRange, parsePeriod } from "../../../reports/period";
import PeriodTabs from "../../../reports/period-tabs";
import KartuStokList, { type KartuStokRow } from "./kartu-stok-list";

export default async function LocationKartuStokPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const { businessId, locationId } = await params;
  const { period: periodParam, from, to } = await searchParams;
  const cookieStore = await cookies();
  const period = parsePeriod(periodParam ?? cookieStore.get(PERIOD_COOKIE_NAME)?.value);
  const { fromIso, toIsoExclusive } = getPeriodRange(period, from, to);
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

  const [adjustments, { data: ingredientStocks }, { data: semiStocks }, { data: opnameEntries }] = await Promise.all([
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
  ]);

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

  const list = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="w-full max-w-3xl">
      <Link
        href={`/business/${businessId}/lokasi/${locationId}/bahan-baku`}
        className="text-xs text-zinc-400 hover:text-brand-600"
      >
        ← {location.name}
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Kartu Stok — {location.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Stock Masuk/Keluar: {PERIOD_DESCRIPTIONS[period]}
          </p>
        </div>
        <PeriodTabs basePath={`/business/${businessId}/lokasi/${locationId}/kartu-stok`} period={period} />
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        Stok Data (sistem) & Stok Riil (opname terakhir) selalu saldo terkini. Stock Masuk/Keluar
        mengikuti periode yang dipilih.
      </p>

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
    </div>
  );
}
