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
const PALETTE = [
  "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#f43f5e",
  "#06b6d4", "#84cc16", "#ec4899", "#6366f1", "#14b8a6",
];

type TabKey = "ringkasan" | "pembayaran" | "item" | "kategori" | "transaksi";
const TABS: { key: TabKey; label: string }[] = [
  { key: "ringkasan", label: "Ringkasan" },
  { key: "pembayaran", label: "Metode Bayar" },
  { key: "item", label: "Item" },
  { key: "kategori", label: "Kategori" },
  { key: "transaksi", label: "Transaksi" },
];

function fmt(v: number) {
  const sign = v < 0 ? "-" : "";
  return `${sign}Rp ${Math.round(Math.abs(v)).toLocaleString("id-ID")}`;
}
function fmtCompact(v: number) {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}Rp${(abs / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${sign}Rp${(abs / 1_000_000).toFixed(1)}Jt`;
  if (abs >= 1_000) return `${sign}Rp${(abs / 1_000).toFixed(0)}Rb`;
  return `${sign}Rp${Math.round(abs).toLocaleString("id-ID")}`;
}
function fmtShort(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}jt`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}rb`;
  return String(Math.round(v));
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    timeZone: REPORT_TIMEZONE,
  });
}
function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", timeZone: REPORT_TIMEZONE,
  });
}
function fmtDateFull(d: string) {
  return new Date(d).toLocaleDateString("id-ID", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: REPORT_TIMEZONE,
  });
}
const hourFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric", hourCycle: "h23", timeZone: REPORT_TIMEZONE,
});
function wibHour(iso: string) { return Number(hourFmt.format(new Date(iso))); }
function toDateWib(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 10);
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="border-t border-zinc-100 bg-zinc-50 px-5 py-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{label}</p>
    </div>
  );
}
function StatRow({
  label, value, bold, indent, muted, negative,
}: {
  label: string; value: string; bold?: boolean; indent?: boolean; muted?: boolean; negative?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 px-5 py-3 ${indent ? "pl-9" : ""}`}>
      <span className={`text-sm ${bold ? "font-bold text-zinc-900" : muted ? "text-zinc-400" : "text-zinc-700"}`}>
        {label}
      </span>
      <span className={`text-sm font-semibold tabular-nums ${bold ? "text-zinc-900" : negative ? "text-red-500" : "text-zinc-800"}`}>
        {value}
      </span>
    </div>
  );
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string; tab?: string }>;
}) {
  const { businessId } = await params;
  const { period: periodParam, from, to, tab: tabParam } = await searchParams;
  const cookieStore = await cookies();
  const period = parsePeriod(periodParam ?? cookieStore.get(PERIOD_COOKIE_NAME)?.value);
  const { fromIso, toIsoExclusive } = getPeriodRange(period, from, to);
  const activeTab: TabKey = TABS.some((t) => t.key === tabParam)
    ? (tabParam as TabKey)
    : "ringkasan";

  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses").select("id, name").eq("id", businessId).single();
  if (!business) notFound();

  let txQuery = supabase
    .from("transactions")
    .select("id, invoice_number, date, subtotal, subtotal_raw, total, total_item_disc, order_disc_amt, service, tax, total_cost, gross_profit, is_split, voided, transaction_items(product_id, name, category, price, qty), transaction_payments(method, amount)")
    .eq("business_id", businessId)
    .order("date", { ascending: false });
  if (fromIso) txQuery = txQuery.gte("date", fromIso);
  if (toIsoExclusive) txQuery = txQuery.lt("date", toIsoExclusive);
  const { data: transactions } = await txQuery;

  const txList = transactions ?? [];
  const validTx = txList.filter((t) => !t.voided);
  const voidCount = txList.length - validTx.length;

  // ── KPI ──
  const itemsGross = validTx.reduce(
    (s, t) => s + t.transaction_items.reduce((a, i) => a + Number(i.price) * Number(i.qty), 0), 0,
  );
  const revenue = validTx.reduce((s, t) => s + Number(t.total), 0);
  const totalDiskon = validTx.reduce(
    (s, t) => s + Number(t.total_item_disc ?? 0) + Number(t.order_disc_amt ?? 0), 0,
  );
  const totalTax = validTx.reduce((s, t) => s + Number(t.tax ?? 0), 0);
  const totalService = validTx.reduce((s, t) => s + Number(t.service ?? 0), 0);
  const count = validTx.length;
  const avg = count > 0 ? Math.round(revenue / count) : 0;
  const totalItems = validTx.reduce(
    (s, t) => s + t.transaction_items.reduce((a, i) => a + Number(i.qty), 0), 0,
  );
  const txWithCost = validTx.filter((t) => Number(t.total_cost) > 0);
  const grossProfit = txWithCost.reduce((s, t) => s + Number(t.gross_profit), 0);
  const revenueWithCost = txWithCost.reduce((s, t) => s + Number(t.subtotal), 0);
  const avgMargin = revenueWithCost > 0 ? Math.round((grossProfit / revenueWithCost) * 100) : null;
  const missingCostCount = validTx.length - txWithCost.length;

  // ── Pembayaran ──
  let cashRev = 0, nonCashRev = 0;
  const byMethod = new Map<string, number>();
  for (const t of validTx)
    for (const p of t.transaction_payments) {
      byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + Number(p.amount));
      if (p.method === "Tunai") cashRev += Number(p.amount);
      else nonCashRev += Number(p.amount);
    }
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

  // ── Item terlaris ──
  const menuSales = new Map<string, { name: string; productId: string | null; qty: number; sales: number }>();
  for (const t of validTx)
    for (const i of t.transaction_items) {
      const e = menuSales.get(i.name) ?? { name: i.name, productId: i.product_id, qty: 0, sales: 0 };
      e.qty += Number(i.qty);
      e.sales += Number(i.price) * Number(i.qty);
      menuSales.set(i.name, e);
    }
  const allMenus = Array.from(menuSales.values()).sort((a, b) => b.sales - a.sales);

  const productIds = allMenus.map((m) => m.productId).filter((id): id is string => id !== null);
  const emojiMap = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: products } = await supabase.from("products").select("id, emoji").in("id", productIds);
    for (const p of products ?? []) if (p.emoji) emojiMap.set(p.id, p.emoji);
  }

  // ── Jam ──
  const hourly = Array<number>(24).fill(0);
  for (const t of validTx) hourly[wibHour(t.date)] += Number(t.total);
  const hourlyMax = Math.max(...hourly, 1);
  const currentHour = wibHour(new Date().toISOString());
  const peakHours = hourly.map((v, h) => ({ h, v })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3);

  // ── Tren harian ──
  const dayMap = new Map<string, { rev: number; bills: number }>();
  for (const t of validTx) {
    const key = toDateWib(t.date);
    const e = dayMap.get(key) ?? { rev: 0, bills: 0 };
    e.rev += Number(t.total);
    e.bills += 1;
    dayMap.set(key, e);
  }
  const dayList = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const bestDay = dayList.length > 0
    ? dayList.reduce((m, d) => d.rev > m.rev ? d : m, dayList[0])
    : null;

  // ── SVG Line Chart ──
  const n = dayList.length;
  const W = 560, H = 110, PX = 8, PY = 14;
  const chartW = W - PX * 2;
  const chartH = H - PY * 2;
  const maxRev = Math.max(...dayList.map((d) => d.rev), 1);
  const minRev = Math.min(...dayList.map((d) => d.rev), 0);
  function xOf(i: number) { return PX + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW); }
  function yOf(v: number) {
    const range = maxRev - minRev || 1;
    return PY + chartH - ((v - minRev) / range) * chartH;
  }
  const pts = dayList.map((d, i) => ({ x: xOf(i), y: yOf(d.rev), d }));
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = n > 0
    ? `${linePath} L${pts[n - 1].x.toFixed(1)},${(PY + chartH).toFixed(1)} L${pts[0].x.toFixed(1)},${(PY + chartH).toFixed(1)} Z`
    : "";

  const periodQuery = period === "custom"
    ? `period=custom${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`
    : `period=${period}`;

  function tabHref(t: TabKey) {
    return `/business/${businessId}/reports?tab=${t}&${periodQuery}`;
  }

  return (
    <div className="w-full max-w-3xl">

      {/* ── Header ── */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Laporan Penjualan</p>
          <h1 className="text-xl font-bold text-zinc-900">{business.name}</h1>
        </div>
        <PeriodTabs basePath={`/business/${businessId}/reports`} period={period} />
      </div>

      {period === "custom" && (
        <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
          <input type="hidden" name="period" value="custom" />
          <input type="hidden" name="tab" value={activeTab} />
          <label className="text-xs font-medium text-zinc-600">Dari
            <input type="date" name="from" defaultValue={from} className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-zinc-600">Sampai
            <input type="date" name="to" defaultValue={to} className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700">
            Terapkan
          </button>
        </form>
      )}

      {/* ── Stat Cards ── */}
      {validTx.length > 0 ? (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-brand-600 p-4 text-white">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide opacity-80">Pendapatan</p>
            <p className="mt-2 text-xl font-bold leading-tight">{fmtCompact(revenue)}</p>
            <p className="mt-1 text-[11px] opacity-70">{fmt(revenue)}</p>
          </div>
          <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">Transaksi</p>
            <p className="mt-2 text-xl font-bold text-zinc-900">{count.toLocaleString("id-ID")}</p>
            <p className="mt-1 text-[11px] text-zinc-400">{dayList.length} hari aktif</p>
          </div>
          <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">Rata-rata/Bill</p>
            <p className="mt-2 text-xl font-bold text-zinc-900">{fmtCompact(avg)}</p>
            <p className="mt-1 text-[11px] text-zinc-400">{fmt(avg)}</p>
          </div>
          {bestDay && (
            <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">Hari Terbaik</p>
              <p className="mt-2 text-xl font-bold text-brand-700">{fmtCompact(bestDay.rev)}</p>
              <p className="mt-1 text-[11px] text-zinc-400">{fmtDateShort(bestDay.date)}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="mb-5 rounded-2xl border border-zinc-100 bg-white px-6 py-12 text-center shadow-sm">
          <p className="text-3xl mb-3">📊</p>
          <p className="text-sm font-medium text-zinc-700">Belum ada transaksi pada periode ini</p>
          <p className="mt-1 text-xs text-zinc-400">Pilih periode lain atau tunggu data masuk dari kasir.</p>
        </div>
      )}

      {/* ── Badge info ── */}
      {validTx.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600">
            {totalItems} item terjual
          </span>
          {totalDiskon > 0 && (
            <span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600">
              Diskon −{fmt(totalDiskon)}
            </span>
          )}
          {totalTax > 0 && (
            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
              PPN +{fmt(totalTax)}
            </span>
          )}
          {totalService > 0 && (
            <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700">
              Service +{fmt(totalService)}
            </span>
          )}
          {voidCount > 0 && (
            <span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-400">
              {voidCount} void
            </span>
          )}
        </div>
      )}

      {/* ── Tab navigation ── */}
      <div className="mb-4 flex overflow-x-auto border-b border-zinc-200 bg-white">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tabHref(tab.key)}
            className={`shrink-0 border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
              activeTab === tab.key
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* ══════════════════════════════════════════
          TAB: RINGKASAN
      ══════════════════════════════════════════ */}
      {activeTab === "ringkasan" && (
        <div className="space-y-4">

          {/* Line Chart Tren Harian */}
          {n > 1 && (
            <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Tren Pendapatan Harian</p>
              <div className="overflow-x-auto">
                <svg viewBox={`0 0 ${W} ${H + 20}`} width="100%"
                  style={{ minWidth: Math.max(280, n * 36) }} className="block">
                  <defs>
                    <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#16a34a" stopOpacity="0.18" />
                      <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[0, 0.5, 1].map((r) => (
                    <line key={r} x1={PX} y1={PY + chartH - r * chartH}
                      x2={W - PX} y2={PY + chartH - r * chartH}
                      stroke="#f4f4f5" strokeWidth={1} />
                  ))}
                  <path d={areaPath} fill="url(#trendGrad)" />
                  <path d={linePath} fill="none" stroke="#16a34a" strokeWidth={2.5}
                    strokeLinejoin="round" strokeLinecap="round" />
                  {pts.map((pt, i) => {
                    const isMax = pt.d.rev === maxRev;
                    return (
                      <g key={pt.d.date}>
                        <circle cx={pt.x} cy={pt.y} r={isMax ? 5 : 3.5}
                          fill={isMax ? "#16a34a" : "#fff"}
                          stroke="#16a34a" strokeWidth={isMax ? 0 : 2} />
                        {(n <= 14 || isMax) && (
                          <text x={pt.x} y={pt.y - 9} textAnchor="middle"
                            fontSize={8.5} fontWeight={isMax ? "700" : "400"}
                            fill={isMax ? "#16a34a" : "#a1a1aa"}>
                            {fmtShort(pt.d.rev)}
                          </text>
                        )}
                        <text x={pt.x} y={H + 14} textAnchor="middle" fontSize={8} fill="#d4d4d8">
                          {fmtDateShort(pt.d.date)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          )}

          {/* Financial statement */}
          {validTx.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
              <SectionDivider label="Penjualan" />
              <StatRow label="Total Penjualan (Bruto)" value={fmt(itemsGross)} />
              {totalDiskon > 0 && <StatRow label="Diskon" value={`(${fmt(totalDiskon)})`} indent negative />}
              {totalService > 0 && <StatRow label="Service Charge" value={fmt(totalService)} indent />}
              {totalTax > 0 && <StatRow label="Pajak (PPN)" value={fmt(totalTax)} indent />}
              <div className="border-t border-zinc-200">
                <StatRow label="Net Pendapatan" value={fmt(revenue)} bold />
              </div>

              <SectionDivider label="Volume" />
              <StatRow label="Jumlah Transaksi" value={`${count} transaksi`} />
              {voidCount > 0 && <StatRow label="Transaksi Void" value={voidCount.toString()} muted />}
              <StatRow label="Rata-rata Per Transaksi" value={fmt(avg)} />
              <StatRow label="Item Terjual" value={`${totalItems} qty`} />

              <SectionDivider label="Profitabilitas" />
              <StatRow
                label="Laba Kotor (HPP)"
                value={avgMargin === null ? "— (belum ada harga modal)" : fmt(grossProfit)}
              />
              <StatRow
                label="Margin Rata-rata"
                value={avgMargin === null ? "—" : `${avgMargin}%`}
                muted={avgMargin === null}
              />
              {missingCostCount > 0 && (
                <StatRow label={`${missingCostCount} transaksi tanpa harga modal`} value="" muted indent />
              )}

              <SectionDivider label="Penerimaan" />
              <StatRow label="Tunai" value={fmt(cashRev)} />
              <StatRow label="Non-Tunai" value={fmt(nonCashRev)} />
              <div className="border-t border-zinc-200">
                <StatRow label="Total Penerimaan" value={fmt(methodTotal)} bold />
              </div>
            </div>
          )}

          {/* Hourly chart */}
          {validTx.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Jam Tersibuk</p>
                <div className="flex gap-1.5">
                  {peakHours.map(({ h }) => (
                    <span key={h} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">
                      {String(h).padStart(2, "0")}:00
                    </span>
                  ))}
                </div>
              </div>
              <div className="px-5 py-4">
                <div className="flex h-20 items-end gap-0.5">
                  {hourly.map((val, h) => {
                    const isNow = period === "today" && h === currentHour;
                    const isPeak = peakHours.some((p) => p.h === h);
                    const hasTx = val > 0;
                    const pct = Math.round((val / hourlyMax) * 100);
                    return (
                      <div key={h} className="flex flex-1 flex-col items-center justify-end" title={`${String(h).padStart(2,"0")}:00 — ${fmt(val)}`}>
                        <div
                          className={`w-full rounded-t ${isNow ? "bg-amber-400" : isPeak ? "bg-brand-600" : hasTx ? "bg-brand-200" : "bg-zinc-100"}`}
                          style={{ height: `${Math.max(pct, hasTx ? 6 : 2)}%`, minHeight: hasTx ? "6px" : "2px" }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] text-zinc-300">
                  <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
                </div>
              </div>
            </div>
          )}

          {/* Tabel harian */}
          {dayList.length > 1 && (
            <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
              <div className="border-b border-zinc-50 px-5 py-3.5">
                <p className="text-sm font-semibold text-zinc-800">Rincian per Hari</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-zinc-100 bg-zinc-50/60">
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                      <th className="px-5 py-3">Tanggal</th>
                      <th className="px-5 py-3 text-right">Bill</th>
                      <th className="px-5 py-3 text-right">Pendapatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...dayList].reverse().map((d, i) => (
                      <tr key={d.date}
                        className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}>
                        <td className="px-5 py-3 text-xs font-medium text-zinc-700 whitespace-nowrap">
                          {fmtDateFull(d.date)}
                        </td>
                        <td className="px-5 py-3 text-right text-xs text-zinc-600">{d.bills}</td>
                        <td className="px-5 py-3 text-right text-xs font-bold text-zinc-900">{fmt(d.rev)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-zinc-100 bg-zinc-50">
                    <tr>
                      <td className="px-5 py-3 text-xs font-bold text-zinc-700">Total</td>
                      <td className="px-5 py-3 text-right text-xs font-bold text-zinc-700">{count}</td>
                      <td className="px-5 py-3 text-right text-sm font-bold text-zinc-900">{fmt(revenue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Export */}
          <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
            <div className="border-b border-zinc-100 px-5 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Ekspor & Cetak</p>
            </div>
            <div className="grid grid-cols-2 gap-2 p-4">
              <a href={`/business/${businessId}/reports/export?type=menu&${periodQuery}`} className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                🍽️ Menu.csv
              </a>
              <a href={`/business/${businessId}/reports/export?type=transactions&${periodQuery}`} className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                🧾 Transaksi.csv
              </a>
              <a href={`/business/${businessId}/export?${periodQuery}`} className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-xs font-semibold text-white hover:bg-brand-700">
                📊 Semua Laporan Akuntansi (Excel)
              </a>
            </div>
            <div className="border-t border-zinc-100 px-4 pb-4">
              <ReportPrintButtons businessId={businessId} fromIso={fromIso} toIsoExclusive={toIsoExclusive} periodLabel={PERIOD_DESCRIPTIONS[period]} />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: METODE BAYAR
      ══════════════════════════════════════════ */}
      {activeTab === "pembayaran" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
          <div className="grid grid-cols-[1fr_5rem_5.5rem_3rem] gap-3 border-b border-zinc-100 px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            <span>Metode</span>
            <span className="text-right">Transaksi</span>
            <span className="text-right">Jumlah</span>
            <span className="text-right">%</span>
          </div>

          {methodEntries.length > 0 ? (
            <>
              <div className="divide-y divide-zinc-100">
                {methodEntries.map(([label, val], i) => {
                  const pct = methodTotal > 0 ? Math.round((val / methodTotal) * 100) : 0;
                  const txCount = validTx.filter((t) =>
                    t.transaction_payments.some((p) => p.method === label),
                  ).length;
                  return (
                    <div key={label} className="grid grid-cols-[1fr_5rem_5.5rem_3rem] items-center gap-3 px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-50">
                          <div className="h-2 w-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">{label}</p>
                          <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-zinc-100">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }} />
                          </div>
                        </div>
                      </div>
                      <span className="text-right text-sm text-zinc-500">{txCount}x</span>
                      <span className="text-right text-sm font-semibold text-zinc-900">{fmt(val)}</span>
                      <span className="text-right text-sm font-bold text-zinc-400">{pct}%</span>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-[1fr_5rem_5.5rem_3rem] gap-3 border-t border-zinc-200 bg-zinc-50 px-5 py-3">
                <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">Total</span>
                <span className="text-right text-xs font-bold text-zinc-500">{count}x</span>
                <span className="text-right text-sm font-bold text-zinc-900">{fmt(methodTotal)}</span>
                <span className="text-right text-xs font-bold text-zinc-400">100%</span>
              </div>
            </>
          ) : (
            <p className="py-16 text-center text-sm text-zinc-300">Belum ada data pembayaran</p>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: ITEM
      ══════════════════════════════════════════ */}
      {activeTab === "item" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
          <div className="grid grid-cols-[2rem_1fr_3.5rem_6rem_3.5rem] gap-2 border-b border-zinc-100 px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            <span>#</span>
            <span>Produk</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Omset</span>
            <span className="text-right">%</span>
          </div>

          {allMenus.length > 0 ? (
            <div className="divide-y divide-zinc-100">
              {allMenus.map((m, i) => {
                const pct = itemsGross > 0 ? Math.round((m.sales / itemsGross) * 100) : 0;
                const emoji = (m.productId && emojiMap.get(m.productId)) || "🛍️";
                return (
                  <div key={m.name} className="grid grid-cols-[2rem_1fr_3.5rem_6rem_3.5rem] items-center gap-2 px-5 py-3.5">
                    <div className="text-center text-sm leading-none">
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
            <p className="py-16 text-center text-sm text-zinc-300">Belum ada data item</p>
          )}

          {allMenus.length > 0 && (
            <div className="grid grid-cols-[2rem_1fr_3.5rem_6rem_3.5rem] gap-2 border-t border-zinc-200 bg-zinc-50 px-5 py-3">
              <span />
              <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">Total</span>
              <span className="text-right text-xs font-bold text-zinc-500">{totalItems}x</span>
              <span className="text-right text-sm font-bold text-zinc-900">{fmt(itemsGross)}</span>
              <span className="text-right text-xs font-bold text-zinc-400">100%</span>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: KATEGORI
      ══════════════════════════════════════════ */}
      {activeTab === "kategori" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
          <div className="grid grid-cols-[1fr_6rem_3.5rem] gap-3 border-b border-zinc-100 px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            <span>Kategori</span>
            <span className="text-right">Omset</span>
            <span className="text-right">%</span>
          </div>

          {categoryEntries.length > 0 ? (
            <>
              <div className="divide-y divide-zinc-100">
                {categoryEntries.map(([cat, val], i) => {
                  const pct = itemsGross > 0 ? Math.round((val / itemsGross) * 100) : 0;
                  const barPct = categoryEntries[0]?.[1] ? Math.round((val / categoryEntries[0][1]) * 100) : 0;
                  return (
                    <div key={cat} className="grid grid-cols-[1fr_6rem_3.5rem] items-center gap-3 px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-zinc-900">{cat}</p>
                          <div className="mt-1 h-1 w-full max-w-[10rem] overflow-hidden rounded-full bg-zinc-100">
                            <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: PALETTE[i % PALETTE.length] }} />
                          </div>
                        </div>
                      </div>
                      <span className="text-right text-sm font-bold text-zinc-900">{fmt(val)}</span>
                      <span className="text-right text-sm font-bold text-zinc-400">{pct}%</span>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-[1fr_6rem_3.5rem] gap-3 border-t border-zinc-200 bg-zinc-50 px-5 py-3">
                <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">Total</span>
                <span className="text-right text-sm font-bold text-zinc-900">{fmt(itemsGross)}</span>
                <span className="text-right text-xs font-bold text-zinc-400">100%</span>
              </div>
            </>
          ) : (
            <p className="py-16 text-center text-sm text-zinc-300">Belum ada data kategori</p>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          TAB: TRANSAKSI
      ══════════════════════════════════════════ */}
      {activeTab === "transaksi" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-zinc-100 px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            <span>Transaksi</span>
            <span>Metode</span>
            <span className="text-right">Total</span>
          </div>

          {txList.length > 0 ? (
            <>
              <div className="divide-y divide-zinc-100">
                {txList.slice(0, 50).map((t) => (
                  <Link
                    key={t.id}
                    href={`/business/${businessId}/transactions/${t.id}`}
                    className={`grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-zinc-50 ${t.voided ? "opacity-50" : ""}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-zinc-900">{t.invoice_number}</span>
                        {t.voided && <span className="rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold text-red-600">VOID</span>}
                        {t.is_split && <span className="rounded bg-violet-100 px-1 py-0.5 text-[9px] font-bold text-violet-600">SPLIT</span>}
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-400">{fmtDate(t.date)} · {t.transaction_items.length} item</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                      {t.transaction_payments[0]?.method ?? "—"}
                      {t.transaction_payments.length > 1 && ` +${t.transaction_payments.length - 1}`}
                    </span>
                    <span className={`text-right text-sm font-bold ${t.voided ? "text-red-400 line-through" : "text-zinc-900"}`}>
                      {fmt(Number(t.total))}
                    </span>
                  </Link>
                ))}
              </div>
              {txList.length > 50 && (
                <Link href={`/business/${businessId}/transactions`} className="block border-t border-zinc-100 px-5 py-3 text-center text-xs font-semibold text-brand-600 hover:bg-zinc-50">
                  Lihat semua {txList.length} transaksi →
                </Link>
              )}
            </>
          ) : (
            <p className="py-16 text-center text-sm text-zinc-300">Belum ada transaksi pada periode ini</p>
          )}
        </div>
      )}
    </div>
  );
}
