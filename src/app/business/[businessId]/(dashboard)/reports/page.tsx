import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  PERIOD_COOKIE_NAME,
  PERIOD_DESCRIPTIONS,
  REPORT_TIMEZONE,
  getPeriodRange,
  parsePeriod,
} from "./period";
import PeriodTabs from "./period-tabs";
import ReportPrintButtons from "../../report-print-buttons";

const MEDALS = ["🥇", "🥈", "🥉"];
const METHOD_COLORS = [
  "bg-brand-500",
  "bg-amber-400",
  "bg-violet-400",
  "bg-sky-400",
  "bg-rose-400",
  "bg-emerald-400",
];
const CAT_COLORS = [
  "bg-teal-500",
  "bg-brand-400",
  "bg-emerald-400",
  "bg-sky-400",
  "bg-violet-400",
  "bg-amber-400",
];

function fmt(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: REPORT_TIMEZONE,
  });
}

const hourFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: REPORT_TIMEZONE,
});
function wibHour(iso: string) {
  return Number(hourFmt.format(new Date(iso)));
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { period: periodParam, from, to } = await searchParams;
  const cookieStore = await cookies();
  const period = parsePeriod(periodParam ?? cookieStore.get(PERIOD_COOKIE_NAME)?.value);
  const { fromIso, toIsoExclusive } = getPeriodRange(period, from, to);

  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (!business) notFound();

  let txQuery = supabase
    .from("transactions")
    .select(
      "id, invoice_number, date, subtotal, total, total_cost, gross_profit, is_split, voided, transaction_items(product_id, name, category, price, qty), transaction_payments(method, amount)",
    )
    .eq("business_id", businessId)
    .order("date", { ascending: false });
  if (fromIso) txQuery = txQuery.gte("date", fromIso);
  if (toIsoExclusive) txQuery = txQuery.lt("date", toIsoExclusive);
  const { data: transactions } = await txQuery;

  const txList = transactions ?? [];
  const validTx = txList.filter((t) => !t.voided);
  const voidCount = txList.length - validTx.length;

  // ── KPI ──
  const revenue = validTx.reduce((s, t) => s + Number(t.total), 0);
  const count = validTx.length;
  const avg = count > 0 ? Math.round(revenue / count) : 0;
  const totalItems = validTx.reduce(
    (s, t) => s + t.transaction_items.reduce((a, i) => a + Number(i.qty), 0),
    0,
  );

  const txWithCost = validTx.filter((t) => Number(t.total_cost) > 0);
  const grossProfit = txWithCost.reduce((s, t) => s + Number(t.gross_profit), 0);
  const revenueWithCost = txWithCost.reduce((s, t) => s + Number(t.subtotal), 0);
  const avgMargin =
    revenueWithCost > 0 ? Math.round((grossProfit / revenueWithCost) * 100) : null;
  const missingCostCount = validTx.length - txWithCost.length;

  // ── Tunai vs non-tunai ──
  let cashRev = 0;
  let nonCashRev = 0;
  for (const t of validTx) {
    for (const p of t.transaction_payments) {
      if (p.method === "Tunai") cashRev += Number(p.amount);
      else nonCashRev += Number(p.amount);
    }
  }

  // ── Per jam ──
  const hourly = Array<number>(24).fill(0);
  for (const t of validTx) hourly[wibHour(t.date)] += Number(t.total);
  const hourlyMax = Math.max(...hourly, 1);
  const currentHour = wibHour(new Date().toISOString());

  // ── Metode pembayaran ──
  const byMethod = new Map<string, number>();
  for (const t of validTx)
    for (const p of t.transaction_payments)
      byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + Number(p.amount));
  const methodEntries = Array.from(byMethod.entries()).sort((a, b) => b[1] - a[1]);
  const methodTotal = methodEntries.reduce((s, [, v]) => s + v, 0);

  // ── Kategori ──
  const byCategory = new Map<string, number>();
  for (const t of validTx)
    for (const i of t.transaction_items) {
      const cat = i.category ?? "Lainnya";
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + Number(i.price) * Number(i.qty));
    }
  const categoryEntries = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);
  const categoryMax = categoryEntries[0]?.[1] ?? 1;

  // ── Menu terlaris ──
  const menuSales = new Map<
    string,
    { name: string; productId: string | null; qty: number; sales: number }
  >();
  for (const t of validTx)
    for (const i of t.transaction_items) {
      const e = menuSales.get(i.name) ?? { name: i.name, productId: i.product_id, qty: 0, sales: 0 };
      e.qty += Number(i.qty);
      e.sales += Number(i.price) * Number(i.qty);
      menuSales.set(i.name, e);
    }
  const topMenus = Array.from(menuSales.values()).sort((a, b) => b.sales - a.sales).slice(0, 10);

  const productIds = topMenus.map((m) => m.productId).filter((id): id is string => id !== null);
  const emojiMap = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: products } = await supabase.from("products").select("id, emoji").in("id", productIds);
    for (const p of products ?? []) if (p.emoji) emojiMap.set(p.id, p.emoji);
  }

  const periodQuery =
    period === "custom"
      ? `period=custom${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`
      : `period=${period}`;

  // ── Peak hours (top 3) untuk insight ──
  const peakHours = hourly
    .map((v, h) => ({ h, v }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3);

  return (
    <div className="w-full max-w-3xl space-y-0">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Laporan Penjualan</p>
          <h1 className="text-xl font-bold text-zinc-900">{business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-400">{PERIOD_DESCRIPTIONS[period]}</p>
        </div>
        <PeriodTabs basePath={`/business/${businessId}/reports`} period={period} />
      </div>

      {/* Custom date range form */}
      {period === "custom" && (
        <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
          <input type="hidden" name="period" value="custom" />
          <label className="text-xs font-medium text-zinc-600">
            Dari
            <input type="date" name="from" defaultValue={from} className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Sampai
            <input type="date" name="to" defaultValue={to} className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700">
            Terapkan
          </button>
        </form>
      )}

      {/* ════════════════════════════════════
          SECTION 1 — RINGKASAN PENJUALAN
      ════════════════════════════════════ */}
      <section className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-5 py-3.5">
          <h2 className="text-sm font-bold text-zinc-800">Ringkasan Penjualan</h2>
        </div>

        {/* Hero revenue */}
        <div className="bg-brand-700 px-5 py-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-200">
            Total Pendapatan
          </p>
          <p className="mt-1 text-4xl font-bold tracking-tight text-white">{fmt(revenue)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white">
              {count} transaksi sukses
            </span>
            {voidCount > 0 && (
              <span className="rounded-full bg-red-400/30 px-3 py-1 text-[11px] font-semibold text-red-100">
                {voidCount} void
              </span>
            )}
          </div>
        </div>

        {/* KPI row 1 */}
        <div className="grid grid-cols-2 divide-x divide-y divide-zinc-100 sm:grid-cols-4">
          {[
            { label: "Rata-rata Bill", value: fmt(avg), sub: "per transaksi" },
            { label: "Item Terjual", value: totalItems.toString(), sub: "total qty" },
            { label: "Tunai", value: fmt(cashRev), sub: `${revenue > 0 ? Math.round((cashRev / revenue) * 100) : 0}% dari total` },
            { label: "Non-Tunai", value: fmt(nonCashRev), sub: `${revenue > 0 ? Math.round((nonCashRev / revenue) * 100) : 0}% dari total` },
          ].map((item) => (
            <div key={item.label} className="px-4 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">{item.label}</p>
              <p className="mt-1 text-lg font-bold text-zinc-900">{item.value}</p>
              <p className="text-[11px] text-zinc-400">{item.sub}</p>
            </div>
          ))}
        </div>

        {/* Laba kotor row */}
        <div className="grid grid-cols-2 divide-x divide-zinc-100 border-t border-zinc-100">
          <div className="px-4 py-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Laba Kotor (HPP)</p>
            <p className="mt-1 text-lg font-bold text-brand-700">{fmt(grossProfit)}</p>
            <p className="text-[11px] text-zinc-400">
              {missingCostCount > 0 ? `${missingCostCount} transaksi belum ada harga modal` : "omset dikurangi HPP"}
            </p>
          </div>
          <div className="px-4 py-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Margin Rata-rata</p>
            <p className={`mt-1 text-lg font-bold ${avgMargin === null ? "text-zinc-300" : avgMargin >= 30 ? "text-brand-700" : "text-amber-600"}`}>
              {avgMargin === null ? "—" : `${avgMargin}%`}
            </p>
            <p className="text-[11px] text-zinc-400">
              {avgMargin === null ? "Isi harga modal produk dulu" : "laba ÷ omset"}
            </p>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════
          SECTION 2 — JAM TERSIBUK
      ════════════════════════════════════ */}
      <section className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5">
          <h2 className="text-sm font-bold text-zinc-800">Jam Tersibuk</h2>
          {peakHours.length > 0 && (
            <div className="flex gap-2">
              {peakHours.map(({ h }) => (
                <span key={h} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">
                  {String(h).padStart(2, "0")}:00
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 py-4">
          <div className="flex h-24 items-end gap-0.5">
            {hourly.map((val, h) => {
              const hasTx = val > 0;
              const isNow = period === "today" && h === currentHour;
              const isPeak = peakHours.some((p) => p.h === h);
              const pct = Math.round((val / hourlyMax) * 100);
              return (
                <div
                  key={h}
                  className="group relative flex flex-1 flex-col items-center justify-end"
                  title={`${String(h).padStart(2, "0")}:00 — ${fmt(val)}`}
                >
                  <div
                    className={`w-full rounded-t transition-all ${
                      isNow ? "bg-amber-400" : isPeak ? "bg-brand-500" : hasTx ? "bg-brand-200" : "bg-zinc-100"
                    }`}
                    style={{ height: `${Math.max(pct, hasTx ? 6 : 2)}%`, minHeight: hasTx ? "6px" : "2px" }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-zinc-300">
            <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">
            Batang <span className="font-semibold text-brand-600">hijau tua</span> = jam terlaris ·{" "}
            {period === "today" && <span><span className="font-semibold text-amber-500">kuning</span> = jam ini</span>}
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════
          SECTION 3 — METODE PEMBAYARAN
      ════════════════════════════════════ */}
      <section className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-5 py-3.5">
          <h2 className="text-sm font-bold text-zinc-800">Metode Pembayaran</h2>
        </div>
        {methodEntries.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {methodEntries.map(([label, val], i) => {
              const pct = methodTotal > 0 ? Math.round((val / methodTotal) * 100) : 0;
              return (
                <div key={label} className="flex items-center gap-4 px-5 py-3.5">
                  <div className={`h-3 w-3 shrink-0 rounded-sm ${METHOD_COLORS[i % METHOD_COLORS.length]}`} />
                  <span className="min-w-[5rem] text-sm font-semibold text-zinc-800">{label}</span>
                  <div className="flex-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className={`h-full rounded-full ${METHOD_COLORS[i % METHOD_COLORS.length]}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-8 text-right text-xs font-bold text-zinc-400">{pct}%</span>
                  <span className="w-28 text-right text-sm font-bold text-zinc-900">{fmt(val)}</span>
                </div>
              );
            })}
            <div className="flex items-center justify-between px-5 py-3 bg-zinc-50">
              <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">Total</span>
              <span className="text-sm font-bold text-zinc-900">{fmt(methodTotal)}</span>
            </div>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-zinc-300">Belum ada data</p>
        )}
      </section>

      {/* ════════════════════════════════════
          SECTION 4 — PRODUK TERLARIS
      ════════════════════════════════════ */}
      <section className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5">
          <h2 className="text-sm font-bold text-zinc-800">Produk Terlaris</h2>
          <span className="text-[10px] font-bold uppercase text-zinc-400">{topMenus.length} produk</span>
        </div>

        {/* Table header */}
        {topMenus.length > 0 && (
          <div className="grid grid-cols-[2rem_1fr_3rem_6rem_3.5rem] items-center gap-2 border-b border-zinc-100 px-5 py-2 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
            <span>#</span>
            <span>Produk</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Omset</span>
            <span className="text-right">%</span>
          </div>
        )}

        {topMenus.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {topMenus.map((m, i) => {
              const pct = revenue > 0 ? Math.round((m.sales / revenue) * 100) : 0;
              const emoji = (m.productId && emojiMap.get(m.productId)) || "🛍️";
              return (
                <div key={m.name} className="grid grid-cols-[2rem_1fr_3rem_6rem_3.5rem] items-center gap-2 px-5 py-3">
                  <div className="text-center text-base leading-none">
                    {MEDALS[i] ?? <span className="text-xs font-bold text-zinc-300">{i + 1}</span>}
                  </div>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-lg leading-none">{emoji}</span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-zinc-900">{m.name}</p>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
                        <div className="h-full rounded-full bg-brand-400" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                  <span className="text-right text-xs font-semibold text-zinc-500">{m.qty}x</span>
                  <span className="text-right text-sm font-bold text-zinc-900">{fmt(m.sales)}</span>
                  <span className="text-right text-xs font-bold text-zinc-400">{pct}%</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-zinc-300">Belum ada data penjualan</p>
        )}
      </section>

      {/* ════════════════════════════════════
          SECTION 5 — KATEGORI
      ════════════════════════════════════ */}
      {categoryEntries.length > 0 && (
        <section className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-5 py-3.5">
            <h2 className="text-sm font-bold text-zinc-800">Penjualan per Kategori</h2>
          </div>
          <div className="divide-y divide-zinc-100">
            {categoryEntries.map(([cat, val], i) => {
              const pct = categoryMax > 0 ? Math.round((val / categoryMax) * 100) : 0;
              const totalPct = revenue > 0 ? Math.round((val / revenue) * 100) : 0;
              return (
                <div key={cat} className="flex items-center gap-4 px-5 py-3.5">
                  <div className={`h-3 w-3 shrink-0 rounded-sm ${CAT_COLORS[i % CAT_COLORS.length]}`} />
                  <span className="min-w-[5rem] text-sm font-semibold text-zinc-800">{cat}</span>
                  <div className="flex-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className={`h-full rounded-full ${CAT_COLORS[i % CAT_COLORS.length]}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-8 text-right text-xs font-bold text-zinc-400">{totalPct}%</span>
                  <span className="w-28 text-right text-sm font-bold text-zinc-900">{fmt(val)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ════════════════════════════════════
          SECTION 6 — RIWAYAT TRANSAKSI
      ════════════════════════════════════ */}
      <section className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5">
          <h2 className="text-sm font-bold text-zinc-800">Riwayat Transaksi</h2>
          <span className="text-[10px] font-bold uppercase text-zinc-400">{count} sukses · {voidCount} void</span>
        </div>

        {/* Column headers */}
        {txList.length > 0 && (
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-zinc-100 px-5 py-2 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
            <span>Transaksi</span>
            <span>Metode</span>
            <span className="text-right">Total</span>
          </div>
        )}

        {txList.length > 0 ? (
          <>
            <div className="divide-y divide-zinc-100">
              {txList.slice(0, 25).map((t) => (
                <Link
                  key={t.id}
                  href={`/business/${businessId}/transactions/${t.id}`}
                  className={`grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-3 transition-colors hover:bg-zinc-50 ${t.voided ? "opacity-50" : ""}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13px] font-semibold text-zinc-900">{t.invoice_number}</p>
                      {t.voided && (
                        <span className="rounded-sm bg-red-100 px-1 py-0.5 text-[9px] font-bold text-red-600">
                          VOID
                        </span>
                      )}
                      {t.is_split && (
                        <span className="rounded-sm bg-violet-100 px-1 py-0.5 text-[9px] font-bold text-violet-600">
                          SPLIT
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-zinc-400">
                      {fmtDate(t.date)} · {t.transaction_items.length} item
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600">
                    {t.transaction_payments[0]?.method ?? "—"}
                    {t.transaction_payments.length > 1 && ` +${t.transaction_payments.length - 1}`}
                  </span>
                  <span className={`text-right text-sm font-bold ${t.voided ? "text-red-400 line-through" : "text-zinc-900"}`}>
                    {fmt(Number(t.total))}
                  </span>
                </Link>
              ))}
            </div>
            {txList.length > 25 && (
              <Link
                href={`/business/${businessId}/transactions`}
                className="block border-t border-zinc-100 px-5 py-3 text-center text-xs font-semibold text-brand-600 hover:bg-zinc-50"
              >
                Lihat semua {txList.length} transaksi →
              </Link>
            )}
          </>
        ) : (
          <div className="py-16 text-center">
            <p className="text-sm text-zinc-400">Belum ada transaksi pada periode ini</p>
          </div>
        )}
      </section>

      {/* ════════════════════════════════════
          SECTION 7 — EKSPOR & CETAK
      ════════════════════════════════════ */}
      <section className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-5 py-3.5">
          <h2 className="text-sm font-bold text-zinc-800">Ekspor & Cetak</h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Unduh CSV</p>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={`/business/${businessId}/reports/export?type=menu&${periodQuery}`}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 py-2.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                🍽️ Penjualan Menu
              </a>
              <a
                href={`/business/${businessId}/reports/export?type=transactions&${periodQuery}`}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 py-2.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                🧾 Riwayat Transaksi
              </a>
            </div>
            <a
              href={`/business/${businessId}/export?${periodQuery}`}
              className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
            >
              📊 Semua Laporan Akuntansi (Excel)
            </a>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Cetak</p>
            <ReportPrintButtons
              businessId={businessId}
              fromIso={fromIso}
              toIsoExclusive={toIsoExclusive}
              periodLabel={PERIOD_DESCRIPTIONS[period]}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
