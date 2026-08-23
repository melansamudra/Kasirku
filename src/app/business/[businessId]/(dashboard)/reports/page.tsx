import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import {
  PERIOD_COOKIE_NAME,
  PERIOD_DESCRIPTIONS,
  REPORT_TIMEZONE,
  getPeriodRange,
  parsePeriod,
} from "./period";
import PeriodTabs from "./period-tabs";
import ReportPrintButtons from "../../report-print-buttons";

type ReportTransactionRow = {
  date: string;
  total: number;
  subtotal_raw: number | null;
  subtotal: number;
  total_item_disc: number | null;
  order_disc_amt: number | null;
  service: number | null;
  tax: number | null;
  total_cost: number;
  gross_profit: number;
  voided: boolean;
  transaction_items: { qty: number }[];
  transaction_payments: { method: string; amount: number }[];
};

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
function StatRow({ label, value, bold, indent, muted, negative }: {
  label: string; value: string; bold?: boolean; indent?: boolean; muted?: boolean; negative?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 px-5 py-3 ${indent ? "pl-9" : ""}`}>
      <span className={`text-sm ${bold ? "font-bold text-zinc-900" : muted ? "text-zinc-400" : "text-zinc-700"}`}>{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${bold ? "text-zinc-900" : negative ? "text-red-500" : "text-zinc-800"}`}>{value}</span>
    </div>
  );
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

  const supabase = await createClient();
  const [{ data: business }, { data: userData }] = await Promise.all([
    supabase.from("businesses").select("id, name, owner_id").eq("id", businessId).single(),
    supabase.auth.getUser(),
  ]);
  if (!business) notFound();

  const isOwner = business.owner_id === userData.user?.id;
  // Staf hanya bisa melihat laporan hari ini — paksa periode terlepas dari URL/cookie
  const period = isOwner
    ? parsePeriod(periodParam ?? cookieStore.get(PERIOD_COOKIE_NAME)?.value)
    : "today";
  const { fromIso, toIsoExclusive } = getPeriodRange(period, from, to);

  // Supabase/PostgREST diam-diam memotong hasil query di 1000 baris kalau
  // tidak di-paginate — bisnis dengan riwayat transaksi (termasuk impor
  // Moka) lebih dari 1000 per periode kehilangan baris paling lama tanpa
  // ada error, bikin Pendapatan/Transaksi under-count. Lihat lib/pagination.ts.
  const transactions = await fetchAllRows<ReportTransactionRow>((rangeFrom, rangeTo) => {
    let q = supabase
      .from("transactions")
      .select(
        "date, total, subtotal_raw, subtotal, total_item_disc, order_disc_amt, service, tax, total_cost, gross_profit, voided, transaction_items(qty), transaction_payments(method, amount)",
      )
      .eq("business_id", businessId)
      .order("date", { ascending: false })
      .range(rangeFrom, rangeTo);
    if (fromIso) q = q.gte("date", fromIso);
    if (toIsoExclusive) q = q.lt("date", toIsoExclusive);
    return q;
  });

  const txList = transactions;
  const validTx = txList.filter((t) => !t.voided);
  const voidCount = txList.length - validTx.length;

  const itemsGross = validTx.reduce(
    (s, t) => s + t.transaction_items.reduce((a, i) => a + 0, 0), 0,
  );
  const revenue = validTx.reduce((s, t) => s + Number(t.total), 0);
  const totalDiskon = validTx.reduce((s, t) => s + Number(t.total_item_disc ?? 0) + Number(t.order_disc_amt ?? 0), 0);
  const totalTax = validTx.reduce((s, t) => s + Number(t.tax ?? 0), 0);
  const totalService = validTx.reduce((s, t) => s + Number(t.service ?? 0), 0);
  const totalSubtotalRaw = validTx.reduce((s, t) => s + Number(t.subtotal_raw ?? 0), 0);
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

  let cashRev = 0, nonCashRev = 0;
  const byMethod = new Map<string, number>();
  for (const t of validTx)
    for (const p of t.transaction_payments) {
      byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + Number(p.amount));
      if (p.method === "Tunai") cashRev += Number(p.amount);
      else nonCashRev += Number(p.amount);
    }
  const methodTotal = Array.from(byMethod.values()).reduce((s, v) => s + v, 0);

  const hourly = Array<number>(24).fill(0);
  for (const t of validTx) hourly[wibHour(t.date)] += Number(t.total);
  const hourlyMax = Math.max(...hourly, 1);
  const currentHour = wibHour(new Date().toISOString());
  const peakHours = hourly.map((v, h) => ({ h, v })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3);

  const dayMap = new Map<string, { rev: number; bills: number }>();
  for (const t of validTx) {
    const key = toDateWib(t.date);
    const e = dayMap.get(key) ?? { rev: 0, bills: 0 };
    e.rev += Number(t.total); e.bills += 1;
    dayMap.set(key, e);
  }
  const dayList = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const bestDay = dayList.length > 0 ? dayList.reduce((m, d) => d.rev > m.rev ? d : m, dayList[0]) : null;

  const n = dayList.length;
  // W dulu di-hardcode 560 sementara lebar CSS SVG-nya (minWidth di bawah)
  // sudah melebar sesuai n -- dua-duanya harus sinkron, kalau tidak jarak
  // antar titik di sistem koordinat viewBox tetap sama walau piksel di
  // layar melebar (skala ikut membesar proporsional, jadi rasio lebar
  // label-vs-jarak-antar-titik TIDAK berubah), makanya label tanggal
  // numpuk begitu harinya banyak (mis. 24 hari sebulan). Samakan rumusnya.
  const W = Math.max(280, n * 36), H = 110, PX = 8, PY = 14;
  const chartW = W - PX * 2, chartH = H - PY * 2;
  const maxRev = Math.max(...dayList.map((d) => d.rev), 1);
  const minRev = Math.min(...dayList.map((d) => d.rev), 0);
  function xOf(i: number) { return PX + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW); }
  function yOf(v: number) { return PY + chartH - ((v - minRev) / (maxRev - minRev || 1)) * chartH; }
  const pts = dayList.map((d, i) => ({ x: xOf(i), y: yOf(d.rev), d }));
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = n > 0
    ? `${linePath} L${pts[n - 1].x.toFixed(1)},${(PY + chartH).toFixed(1)} L${pts[0].x.toFixed(1)},${(PY + chartH).toFixed(1)} Z`
    : "";

  const periodQuery = period === "custom"
    ? `period=custom${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`
    : `period=${period}`;

  return (
    <div className="w-full max-w-3xl">

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Laporan Penjualan</p>
          <h1 className="text-xl font-bold text-zinc-900">{business.name}</h1>
        </div>
        {isOwner && <PeriodTabs basePath={`/business/${businessId}/reports`} period={period} />}
        {!isOwner && (
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500">
            Hari Ini
          </span>
        )}
      </div>

      {period === "custom" && (
        <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
          <input type="hidden" name="period" value="custom" />
          <label className="text-xs font-medium text-zinc-600">Dari
            <input type="date" name="from" defaultValue={from} className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-zinc-600">Sampai
            <input type="date" name="to" defaultValue={to} className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700">Terapkan</button>
        </form>
      )}

      {/* Stat Cards */}
      {validTx.length > 0 ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
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

      {/* Badges */}
      {validTx.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <span className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600">{totalItems} item terjual</span>
          {totalDiskon > 0 && <span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600">Diskon −{fmt(totalDiskon)}</span>}
          {totalTax > 0 && <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">PPN +{fmt(totalTax)}</span>}
          {totalService > 0 && <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700">Service +{fmt(totalService)}</span>}
          {voidCount > 0 && <span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-400">{voidCount} void</span>}
        </div>
      )}

      {validTx.length > 0 && (
        <div className="space-y-4">

          {/* Line Chart */}
          {n > 1 && (
            <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Tren Pendapatan Harian</p>
              <div className="overflow-x-auto">
                <svg viewBox={`0 0 ${W} ${H + 20}`} width="100%" style={{ minWidth: W }} className="block">
                  <defs>
                    <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#16a34a" stopOpacity="0.18" />
                      <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[0, 0.5, 1].map((r) => (
                    <line key={r} x1={PX} y1={PY + chartH - r * chartH} x2={W - PX} y2={PY + chartH - r * chartH} stroke="#f4f4f5" strokeWidth={1} />
                  ))}
                  <path d={areaPath} fill="url(#trendGrad)" />
                  <path d={linePath} fill="none" stroke="#16a34a" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                  {pts.map((pt) => {
                    const isMax = pt.d.rev === maxRev;
                    return (
                      <g key={pt.d.date}>
                        <circle cx={pt.x} cy={pt.y} r={isMax ? 5 : 3.5} fill={isMax ? "#16a34a" : "#fff"} stroke="#16a34a" strokeWidth={isMax ? 0 : 2} />
                        {(n <= 14 || isMax) && (
                          <text x={pt.x} y={pt.y - 9} textAnchor="middle" fontSize={8.5} fontWeight={isMax ? "700" : "400"} fill={isMax ? "#16a34a" : "#a1a1aa"}>
                            {fmtShort(pt.d.rev)}
                          </text>
                        )}
                        <text x={pt.x} y={H + 14} textAnchor="middle" fontSize={8} fill="#d4d4d8">{fmtDateShort(pt.d.date)}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          )}

          {/* Financial Summary */}
          <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
            <SectionDivider label="Penjualan" />
            <StatRow label="Total Penjualan (Bruto)" value={fmt(totalSubtotalRaw)} />
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
            <StatRow label="Laba Kotor (HPP)" value={avgMargin === null ? "— (belum ada harga modal)" : fmt(grossProfit)} />
            <StatRow label="Margin Rata-rata" value={avgMargin === null ? "—" : `${avgMargin}%`} muted={avgMargin === null} />
            {missingCostCount > 0 && <StatRow label={`${missingCostCount} transaksi tanpa harga modal`} value="" muted indent />}

            <SectionDivider label="Penerimaan" />
            <StatRow label="Tunai" value={fmt(cashRev)} />
            <StatRow label="Non-Tunai" value={fmt(nonCashRev)} />
            <div className="border-t border-zinc-200">
              <StatRow label="Total Penerimaan" value={fmt(methodTotal)} bold />
            </div>
          </div>

          {/* Hourly Chart */}
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
                    <div key={h} className="flex flex-1 flex-col items-center justify-end" title={`${String(h).padStart(2, "0")}:00 — ${fmt(val)}`}>
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

          {/* Daily table */}
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
                      <tr key={d.date} className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}>
                        <td className="px-5 py-3 text-xs font-medium text-zinc-700 whitespace-nowrap">{fmtDateFull(d.date)}</td>
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
          {isOwner && (
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
          )}
        </div>
      )}
    </div>
  );
}
