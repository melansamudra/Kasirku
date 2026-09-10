import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { todayWibDateString } from "@/lib/wib";
import { submitOpnameEntries } from "./actions";
import OpnameForm from "./opname-form";
import EntryActions from "./entry-actions";
import KartuStokList, { type KartuStokRow } from "../lokasi/[locationId]/kartu-stok/kartu-stok-list";
import { PERIOD_COOKIE_NAME, PERIOD_DESCRIPTIONS, getPeriodRange, parsePeriod } from "../reports/period";
import PeriodTabs from "../reports/period-tabs";

const DEPARTMENT_LABELS: Record<string, string> = { dapur: "Dapur", bar: "Bar", front: "Front" };

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function StockOpnamePage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ divisi?: string; period?: string; from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { divisi, period: periodParam, from, to } = await searchParams;

  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, stock_opname_slug")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const cookieStore = await cookies();
  const period = parsePeriod(periodParam ?? cookieStore.get(PERIOD_COOKIE_NAME)?.value);
  const { fromIso, toIsoExclusive } = getPeriodRange(period, from, to);

  const { data: allIngredients } = await supabase
    .from("ingredients")
    .select("id, name, unit, stock, departments")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name");

  const departmentsInUse = Array.from(
    new Set((allIngredients ?? []).flatMap((i) => i.departments ?? [])),
  ).sort();

  const selectedDivisi = divisi && departmentsInUse.includes(divisi) ? divisi : null;
  const visibleIngredients = selectedDivisi
    ? (allIngredients ?? []).filter((i) => (i.departments ?? []).includes(selectedDivisi))
    : (allIngredients ?? []);

  const { data: entries } = await supabase
    .from("ingredient_opname_entries")
    .select("id, ingredient_id, entry_date, reported_stock, system_stock_at_report, status, submitted_by_name, ingredients(name, unit)")
    .eq("business_id", businessId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  // Stok Data di bawah tetap real-time (saldo & opname terakhir SAAT INI),
  // cuma Stock Masuk/Keluar yang difilter periode -- sama pola dengan Kartu
  // Stok per-lokasi (lokasi/[locationId]/kartu-stok/page.tsx).
  const adjustments = await fetchAllRows<{
    ingredient_id: string | null;
    item_name: string;
    unit: string | null;
    diff: number;
  }>((rangeFrom, rangeTo) => {
    let q = supabase
      .from("stock_adjustments")
      .select("ingredient_id, item_name, unit, diff")
      .eq("business_id", businessId)
      .is("location_id", null)
      .not("ingredient_id", "is", null);
    if (fromIso) q = q.gte("entry_date", fromIso.slice(0, 10));
    if (toIsoExclusive) q = q.lt("entry_date", toIsoExclusive.slice(0, 10));
    return q.range(rangeFrom, rangeTo);
  });

  const { data: latestOpnamePerIngredient } = await supabase
    .from("ingredient_opname_entries")
    .select("ingredient_id, reported_stock, status, entry_date")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  const rows = new Map<string, KartuStokRow>();
  for (const ing of allIngredients ?? []) {
    rows.set(`ing:${ing.id}`, {
      key: `ing:${ing.id}`,
      id: ing.id,
      componentType: "ingredient",
      name: ing.name,
      unit: ing.unit,
      stokData: Number(ing.stock),
      stockMasuk: 0,
      stockKeluar: 0,
      lastOpname: null,
    });
  }
  for (const a of adjustments) {
    if (!a.ingredient_id) continue;
    const row = rows.get(`ing:${a.ingredient_id}`);
    if (!row) continue;
    const diff = Number(a.diff);
    if (diff > 0) row.stockMasuk += diff;
    else row.stockKeluar += Math.abs(diff);
  }
  for (const o of latestOpnamePerIngredient ?? []) {
    const row = rows.get(`ing:${o.ingredient_id}`);
    // Baris pertama yang ketemu per bahan = paling baru (sudah order by
    // created_at desc), sisanya (opname lama) dilewati.
    if (row && !row.lastOpname) {
      row.lastOpname = {
        reportedStock: Number(o.reported_stock),
        status: o.status as "pending" | "verified" | "rejected",
        entryDate: o.entry_date,
      };
    }
  }
  const kartuStokList = [...rows.values()]
    .filter((r) => !selectedDivisi || visibleIngredients.some((i) => i.id === r.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const boundSubmit = submitOpnameEntries.bind(null, businessId);
  const today = todayWibDateString();

  return (
    <div className="w-full max-w-3xl">
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Stock Opname — {business.name}</h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Hitung fisik bahan baku, bandingkan dengan sistem, dan verifikasi selisihnya. Stok baru berubah
          setelah diverifikasi — bukan langsung saat dicatat.
        </p>
      </div>

      {business.stock_opname_slug && (
        <div className="mt-4 rounded-2xl border border-dashed border-brand-200 bg-brand-50 px-4 py-3">
          <p className="text-xs font-semibold text-brand-800">Link Publik untuk Staf</p>
          <p className="mt-0.5 text-[11px] text-brand-700">
            Bagikan link ini ke staf supaya bisa isi hasil hitung fisik sendiri (tanpa login) — hasilnya
            tetap masuk sebagai &quot;pending&quot;, menunggu diverifikasi di halaman ini.
          </p>
          <code className="mt-1.5 block truncate rounded-lg bg-white px-2.5 py-1.5 text-[11px] text-zinc-700">
            /bahan-opname/{business.stock_opname_slug}
          </code>
        </div>
      )}

      {departmentsInUse.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`/business/${businessId}/stock-opname`}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              !selectedDivisi ? "bg-brand-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            Semua Divisi
          </a>
          {departmentsInUse.map((d) => (
            <a
              key={d}
              href={`/business/${businessId}/stock-opname?divisi=${d}`}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                selectedDivisi === d ? "bg-brand-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {DEPARTMENT_LABELS[d] ?? d}
            </a>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Catat Hasil Hitung Fisik</h2>
        <OpnameForm action={boundSubmit} ingredients={visibleIngredients ?? []} today={today} />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-bold text-zinc-900">Menunggu &amp; Riwayat Verifikasi</h2>
        </div>
        <div className="divide-y divide-zinc-50 px-4">
          {(entries ?? []).length === 0 && (
            <p className="py-6 text-center text-xs text-zinc-300">Belum ada catatan opname.</p>
          )}
          {(entries ?? []).map((e) => {
            const diff = Number(e.reported_stock) - Number(e.system_stock_at_report);
            const ing = e.ingredients as unknown as { name: string; unit: string } | null;
            return (
              <div key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                <div className="min-w-0">
                  <p className="font-medium text-zinc-700">
                    {ing?.name ?? "Bahan terhapus"} · {formatDate(e.entry_date)}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Sistem {e.system_stock_at_report} {ing?.unit} vs Fisik {e.reported_stock} {ing?.unit} ·{" "}
                    <span className={diff === 0 ? "text-zinc-400" : diff > 0 ? "text-brand-700" : "text-red-600"}>
                      Selisih {diff > 0 ? "+" : ""}
                      {diff}
                    </span>
                  </p>
                </div>
                {e.status === "pending" ? (
                  <EntryActions businessId={businessId} entryId={e.id} />
                ) : (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      e.status === "verified" ? "bg-brand-50 text-brand-700" : "bg-zinc-100 text-zinc-400"
                    }`}
                  >
                    {e.status === "verified" ? "✓ Terverifikasi" : "Ditolak"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Kartu Stok</h2>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              Stok Data & Stok Riil selalu saldo terkini. Stock Masuk/Keluar: {PERIOD_DESCRIPTIONS[period]}.
            </p>
          </div>
          <PeriodTabs basePath={`/business/${businessId}/stock-opname`} period={period} />
        </div>

        {period === "custom" && (
          <form method="get" className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-white shadow-sm p-4">
            <input type="hidden" name="period" value="custom" />
            {selectedDivisi && <input type="hidden" name="divisi" value={selectedDivisi} />}
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

        <div className="mt-3">
          <KartuStokList items={kartuStokList} />
        </div>
      </div>
    </div>
  );
}
