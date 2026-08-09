import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { PERIOD_COOKIE_NAME, getPeriodRange, parsePeriod } from "../period";
import PeriodTabs from "../period-tabs";

function fmt(v: number) { return `Rp${Math.round(v).toLocaleString("id-ID")}`; }
function fmtShort(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}jt`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}rb`;
  return String(Math.round(v));
}
function toDateWib(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 10);
}
function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", timeZone: "Asia/Jakarta" });
}
function fmtDateFull(d: string) {
  return new Date(d).toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
}

export default async function ReportsTrenPage({
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
  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (!biz) notFound();

  let q = supabase
    .from("transactions")
    .select("date, total")
    .eq("business_id", businessId)
    .eq("voided", false);
  if (fromIso) q = q.gte("date", fromIso);
  if (toIsoExclusive) q = q.lt("date", toIsoExclusive);
  const { data: rows } = await q;

  const dayMap = new Map<string, { count: number; revenue: number }>();
  for (const t of rows ?? []) {
    const key = toDateWib(t.date);
    const e = dayMap.get(key) ?? { count: 0, revenue: 0 };
    e.count += 1;
    e.revenue += Number(t.total);
    dayMap.set(key, e);
  }
  const dayList = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalRevenue = dayList.reduce((s, d) => s + d.revenue, 0);
  const totalCount = dayList.reduce((s, d) => s + d.count, 0);
  const avgPerDay = dayList.length > 0 ? totalRevenue / dayList.length : 0;
  const bestDay = dayList.length > 0 ? dayList.reduce((m, d) => d.revenue > m.revenue ? d : m, dayList[0]) : null;

  const n = dayList.length;
  const W = 560, H = 160, PX = 8, PY = 20;
  const chartW = W - PX * 2, chartH = H - PY * 2;
  const maxRev = Math.max(...dayList.map((d) => d.revenue), 1);
  const minRev = Math.min(...dayList.map((d) => d.revenue), 0);
  function xOf(i: number) { return PX + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW); }
  function yOf(v: number) { return PY + chartH - ((v - minRev) / (maxRev - minRev || 1)) * chartH; }
  const pts = dayList.map((d, i) => ({ x: xOf(i), y: yOf(d.revenue), d }));
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = n > 0
    ? `${linePath} L${pts[n - 1].x.toFixed(1)},${(PY + chartH).toFixed(1)} L${pts[0].x.toFixed(1)},${(PY + chartH).toFixed(1)} Z`
    : "";

  const basePath = `/business/${businessId}/reports/tren`;

  return (
    <div className="w-full max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-zinc-900">Tren Penjualan Harian</h1>
        <PeriodTabs basePath={basePath} period={period} />
      </div>

      {period === "custom" && (
        <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
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

      {dayList.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-400">
          Belum ada data untuk periode ini.
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-zinc-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Total</p>
              <p className="mt-1 text-base font-bold text-zinc-900">{fmt(totalRevenue)}</p>
              <p className="text-[11px] text-zinc-400">{totalCount} transaksi</p>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Rata-rata/Hari</p>
              <p className="mt-1 text-base font-bold text-zinc-900">{fmt(avgPerDay)}</p>
              <p className="text-[11px] text-zinc-400">{dayList.length} hari aktif</p>
            </div>
            {bestDay && (
              <div className="rounded-xl border border-zinc-100 bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Tertinggi</p>
                <p className="mt-1 text-base font-bold text-brand-700">{fmt(bestDay.revenue)}</p>
                <p className="text-[11px] text-zinc-400">{fmtDateShort(bestDay.date)}</p>
              </div>
            )}
          </div>

          {n > 0 && (
            <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white p-4">
              <div className="overflow-x-auto">
                <svg viewBox={`0 0 ${W} ${H + 28}`} width="100%" style={{ minWidth: Math.max(300, n * 40) }} className="block">
                  <defs>
                    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#16a34a" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[0, 0.25, 0.5, 0.75, 1].map((r) => {
                    const y = PY + chartH - r * chartH;
                    const v = minRev + r * (maxRev - minRev);
                    return (
                      <g key={r}>
                        <line x1={PX} y1={y} x2={W - PX} y2={y} stroke="#f4f4f5" strokeWidth={1} />
                        {r > 0 && r < 1 && <text x={PX} y={y - 3} fontSize={8} fill="#d4d4d8">{fmtShort(v)}</text>}
                      </g>
                    );
                  })}
                  {n > 1 && <path d={areaPath} fill="url(#grad)" />}
                  {n > 1 && <path d={linePath} fill="none" stroke="#16a34a" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
                  {pts.map((pt) => {
                    const isMax = pt.d.revenue === maxRev;
                    return (
                      <g key={pt.d.date}>
                        <circle cx={pt.x} cy={pt.y} r={isMax ? 5 : 3.5} fill={isMax ? "#16a34a" : "#fff"} stroke="#16a34a" strokeWidth={isMax ? 0 : 2} />
                        {(n <= 14 || isMax) && (
                          <text x={pt.x} y={pt.y - 8} textAnchor="middle" fontSize={8.5} fontWeight={isMax ? "700" : "400"} fill={isMax ? "#16a34a" : "#71717a"}>
                            {fmtShort(pt.d.revenue)}
                          </text>
                        )}
                        <text x={pt.x} y={H + 16} textAnchor="middle" fontSize={8} fill="#a1a1aa">{fmtDateShort(pt.d.date)}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          )}

          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-100 bg-zinc-50">
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                    <th className="px-4 py-3">Tanggal</th>
                    <th className="px-4 py-3 text-right">Transaksi</th>
                    <th className="px-4 py-3 text-right">Pendapatan</th>
                    <th className="px-4 py-3 text-right">Rata-rata</th>
                  </tr>
                </thead>
                <tbody>
                  {[...dayList].reverse().map((d, i) => (
                    <tr key={d.date} className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}>
                      <td className="px-4 py-3 text-xs text-zinc-700 whitespace-nowrap">{fmtDateFull(d.date)}</td>
                      <td className="px-4 py-3 text-right text-xs text-zinc-600">{d.count}</td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-zinc-900">{fmt(d.revenue)}</td>
                      <td className="px-4 py-3 text-right text-xs text-zinc-400">{fmt(d.count > 0 ? d.revenue / d.count : 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-zinc-200 bg-zinc-50">
                  <tr>
                    <td className="px-4 py-3 text-xs font-bold text-zinc-700">Total</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-zinc-800">{totalCount}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-zinc-900">{fmt(totalRevenue)}</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-zinc-400">{fmt(totalCount > 0 ? totalRevenue / totalCount : 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
