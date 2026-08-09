import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { PERIOD_COOKIE_NAME, getPeriodRange, parsePeriod } from "../period";
import PeriodTabs from "../period-tabs";

function fmt(v: number) { return `Rp${Math.round(v).toLocaleString("id-ID")}`; }
function fmtJam(h: number) {
  return `${h.toString().padStart(2, "0")}:00 – ${((h + 1) % 24).toString().padStart(2, "0")}:00`;
}

export default async function ReportsPerJamPage({
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

  const hourMap = new Map<number, { count: number; revenue: number }>();
  for (let h = 0; h < 24; h++) hourMap.set(h, { count: 0, revenue: 0 });

  for (const t of rows ?? []) {
    const wib = new Date(new Date(t.date).getTime() + 7 * 3600000);
    const h = wib.getUTCHours();
    const e = hourMap.get(h)!;
    e.count += 1;
    e.revenue += Number(t.total);
  }

  const hourList = Array.from(hourMap.entries())
    .filter(([, v]) => v.count > 0)
    .map(([hour, v]) => ({ hour, ...v }))
    .sort((a, b) => a.hour - b.hour);

  const totalCount = hourList.reduce((s, h) => s + h.count, 0);
  const totalRevenue = hourList.reduce((s, h) => s + h.revenue, 0);
  const busiestHour = hourList.length > 0
    ? hourList.reduce((m, h) => h.count > m.count ? h : m, hourList[0])
    : null;
  const maxRevHour = hourList.length > 0
    ? hourList.reduce((m, h) => h.revenue > m.revenue ? h : m, hourList[0])
    : null;
  const hourlyMax = Math.max(...hourList.map((h) => h.revenue), 1);
  const basePath = `/business/${businessId}/reports/per-jam`;

  return (
    <div className="w-full max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-zinc-900">Laporan per Jam</h1>
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

      {hourList.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-400">
          Belum ada data untuk periode ini.
        </div>
      ) : (
        <>
          {/* Bar chart jam */}
          <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200 bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              {busiestHour && (
                <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                  Tersibuk: {fmtJam(busiestHour.hour)} ({busiestHour.count} transaksi)
                </span>
              )}
              {maxRevHour && maxRevHour.hour !== busiestHour?.hour && (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Pendapatan tertinggi: {fmtJam(maxRevHour.hour)}
                </span>
              )}
            </div>
            <div className="flex h-24 items-end gap-1">
              {Array.from({ length: 24 }, (_, h) => {
                const entry = hourMap.get(h)!;
                const pct = Math.round((entry.revenue / hourlyMax) * 100);
                const isBusiest = busiestHour?.hour === h;
                const hasTx = entry.count > 0;
                return (
                  <div key={h} className="flex flex-1 flex-col items-center justify-end" title={`${fmtJam(h)}: ${entry.count} tx · ${fmt(entry.revenue)}`}>
                    <div
                      className={`w-full rounded-t transition-all ${isBusiest ? "bg-brand-600" : hasTx ? "bg-brand-200" : "bg-zinc-100"}`}
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

          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-100 bg-zinc-50">
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                    <th className="px-4 py-3">Jam (WIB)</th>
                    <th className="px-4 py-3 text-right">Transaksi</th>
                    <th className="px-4 py-3 text-right">% Transaksi</th>
                    <th className="px-4 py-3 text-right">Pendapatan</th>
                  </tr>
                </thead>
                <tbody>
                  {hourList.map((h, i) => {
                    const isBusiest = busiestHour?.hour === h.hour;
                    const pct = totalCount > 0 ? Math.round((h.count / totalCount) * 100) : 0;
                    return (
                      <tr key={h.hour} className={`border-b border-zinc-50 last:border-0 ${isBusiest ? "bg-brand-50/50" : i % 2 === 0 ? "" : "bg-zinc-50/40"}`}>
                        <td className="px-4 py-3 text-xs text-zinc-700">
                          {fmtJam(h.hour)}
                          {isBusiest && <span className="ml-2 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">Tersibuk</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-medium text-zinc-800">{h.count}</td>
                        <td className="px-4 py-3 text-right text-xs text-zinc-400">{pct}%</td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-zinc-900">{fmt(h.revenue)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-zinc-200 bg-zinc-50">
                  <tr>
                    <td className="px-4 py-3 text-xs font-bold text-zinc-700">Total</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-zinc-800">{totalCount}</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-zinc-400">100%</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-zinc-900">{fmt(totalRevenue)}</td>
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
