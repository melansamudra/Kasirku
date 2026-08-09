import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { PERIOD_COOKIE_NAME, getPeriodRange, parsePeriod } from "../period";
import PeriodTabs from "../period-tabs";

function fmt(v: number) { return `Rp${Math.round(v).toLocaleString("id-ID")}`; }
function toDateWib(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 10);
}
function fmtDateFull(d: string) {
  return new Date(d).toLocaleDateString("id-ID", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
  });
}
function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", timeZone: "Asia/Jakarta" });
}

export default async function ReportsHarianPage({
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
    .select("date, total, subtotal_raw, subtotal, total_item_disc, order_disc_amt, service, tax, voided")
    .eq("business_id", businessId)
    .eq("voided", false);
  if (fromIso) q = q.gte("date", fromIso);
  if (toIsoExclusive) q = q.lt("date", toIsoExclusive);
  const { data: rows } = await q;

  type DayData = { count: number; revenue: number; diskon: number; service: number; tax: number; subtotal: number };
  const dayMap = new Map<string, DayData>();

  for (const t of rows ?? []) {
    const key = toDateWib(t.date);
    const e = dayMap.get(key) ?? { count: 0, revenue: 0, diskon: 0, service: 0, tax: 0, subtotal: 0 };
    e.count += 1;
    e.revenue += Number(t.total);
    e.diskon += Number(t.total_item_disc ?? 0) + Number(t.order_disc_amt ?? 0);
    e.service += Number(t.service ?? 0);
    e.tax += Number(t.tax ?? 0);
    e.subtotal += Number(t.subtotal ?? 0);
    dayMap.set(key, e);
  }

  const dayList = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const totals = dayList.reduce(
    (acc, d) => ({ count: acc.count + d.count, revenue: acc.revenue + d.revenue, diskon: acc.diskon + d.diskon, service: acc.service + d.service, tax: acc.tax + d.tax }),
    { count: 0, revenue: 0, diskon: 0, service: 0, tax: 0 },
  );
  const hasDiskon = dayList.some((d) => d.diskon > 0);
  const hasService = dayList.some((d) => d.service > 0);
  const hasTax = dayList.some((d) => d.tax > 0);
  const basePath = `/business/${businessId}/reports/harian`;

  return (
    <div className="w-full max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-zinc-900">Laporan Harian</h1>
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
          {/* Highlight hari pertama (terbaru) */}
          {dayList[0] && (
            <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50 p-4">
              <p className="text-xs font-semibold text-brand-700">{fmtDateFull(dayList[0].date)}</p>
              <div className="mt-2 flex flex-wrap gap-4">
                <div>
                  <p className="text-[10px] text-brand-400 uppercase tracking-wide">Pendapatan</p>
                  <p className="text-xl font-bold text-brand-700">{fmt(dayList[0].revenue)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-brand-400 uppercase tracking-wide">Transaksi</p>
                  <p className="text-xl font-bold text-brand-700">{dayList[0].count}</p>
                </div>
                <div>
                  <p className="text-[10px] text-brand-400 uppercase tracking-wide">Rata-rata</p>
                  <p className="text-xl font-bold text-brand-700">{fmt(dayList[0].count > 0 ? dayList[0].revenue / dayList[0].count : 0)}</p>
                </div>
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
                    {hasDiskon && <th className="px-4 py-3 text-right">Diskon</th>}
                    {hasService && <th className="px-4 py-3 text-right">Service</th>}
                    {hasTax && <th className="px-4 py-3 text-right">Tax</th>}
                    <th className="px-4 py-3 text-right">Pendapatan</th>
                    <th className="px-4 py-3 text-right">Rata-rata</th>
                  </tr>
                </thead>
                <tbody>
                  {dayList.map((d, i) => (
                    <tr key={d.date} className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}>
                      <td className="px-4 py-3 text-xs font-medium text-zinc-700 whitespace-nowrap">
                        {fmtDateShort(d.date)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-zinc-600">{d.count}</td>
                      {hasDiskon && (
                        <td className="px-4 py-3 text-right text-xs text-red-500">
                          {d.diskon > 0 ? `−${fmt(d.diskon)}` : <span className="text-zinc-300">—</span>}
                        </td>
                      )}
                      {hasService && (
                        <td className="px-4 py-3 text-right text-xs text-zinc-500">
                          {d.service > 0 ? fmt(d.service) : <span className="text-zinc-300">—</span>}
                        </td>
                      )}
                      {hasTax && (
                        <td className="px-4 py-3 text-right text-xs text-zinc-500">
                          {d.tax > 0 ? fmt(d.tax) : <span className="text-zinc-300">—</span>}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right text-xs font-bold text-zinc-900">{fmt(d.revenue)}</td>
                      <td className="px-4 py-3 text-right text-xs text-zinc-400">{fmt(d.count > 0 ? d.revenue / d.count : 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-zinc-200 bg-zinc-50">
                  <tr>
                    <td className="px-4 py-3 text-xs font-bold text-zinc-700">Total ({dayList.length} hari)</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-zinc-800">{totals.count}</td>
                    {hasDiskon && <td className="px-4 py-3 text-right text-xs font-bold text-red-500">{totals.diskon > 0 ? `−${fmt(totals.diskon)}` : "—"}</td>}
                    {hasService && <td className="px-4 py-3 text-right text-xs font-bold text-zinc-500">{totals.service > 0 ? fmt(totals.service) : "—"}</td>}
                    {hasTax && <td className="px-4 py-3 text-right text-xs font-bold text-zinc-500">{totals.tax > 0 ? fmt(totals.tax) : "—"}</td>}
                    <td className="px-4 py-3 text-right text-sm font-bold text-zinc-900">{fmt(totals.revenue)}</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-zinc-400">{fmt(totals.count > 0 ? totals.revenue / totals.count : 0)}</td>
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
