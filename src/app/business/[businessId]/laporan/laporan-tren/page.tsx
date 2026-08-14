import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  PERIOD_COOKIE_NAME,
  getPeriodRange,
  parsePeriod,
} from "../../(dashboard)/reports/period";
import PeriodTabs from "../../(dashboard)/reports/period-tabs";

function fmt(v: number) {
  return `Rp${Math.round(v).toLocaleString("id-ID")}`;
}

function fmtShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}jt`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}rb`;
  return String(Math.round(v));
}

function toDateWib(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

// Label sumbu grafik butuh versi pendek tanpa tahun — ruang antar titik
// sempit (fontSize 8, ~40px/titik) sehingga menambah tahun bikin label
// bertabrakan.
function formatDateLabelShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Jakarta",
  });
}

export default async function MirrorLaporanTrenPage({
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: mirrorAccount }, { data: biz }] = await Promise.all([
    supabase.from("mirror_accounts").select("id, permissions").eq("business_id", businessId).maybeSingle(),
    supabase.from("businesses").select("owner_id").eq("id", businessId).maybeSingle(),
  ]);
  const isOwner = biz?.owner_id === user.id;
  if (!mirrorAccount && !isOwner) notFound();

  const service = createServiceClient();

  const p = isOwner
    ? { show_transactions: true, show_amount: true }
    : (mirrorAccount!.permissions ?? {}) as { show_transactions?: boolean; show_amount?: boolean };

  if (!p.show_transactions) notFound();

  const basePath = `/business/${businessId}/laporan/laporan-tren`;

  const { data: rows } = await service
    .from("mirror_visible_transactions")
    .select(
      `transactions!mirror_visible_transactions_transaction_id_fkey(
        date, total, voided
      )`,
    )
    .eq("business_id", businessId);

  const dayMap = new Map<string, { count: number; revenue: number }>();

  for (const row of rows ?? []) {
    const t = row.transactions as unknown as {
      date: string; total: number; voided: boolean;
    } | null;
    if (!t || t.voided) continue;
    if (fromIso && t.date < fromIso) continue;
    if (toIsoExclusive && t.date >= toIsoExclusive) continue;

    const dateKey = toDateWib(t.date);
    const existing = dayMap.get(dateKey);
    if (existing) {
      existing.count += 1;
      existing.revenue += Number(t.total);
    } else {
      dayMap.set(dateKey, { count: 1, revenue: Number(t.total) });
    }
  }

  const dayList = Array.from(dayMap.entries())
    .map(([date, { count, revenue }]) => ({ date, count, revenue }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const maxRevenue = Math.max(...dayList.map((d) => d.revenue), 1);
  const minRevenue = Math.min(...dayList.map((d) => d.revenue), 0);
  const totalRevenue = dayList.reduce((s, d) => s + d.revenue, 0);
  const totalCount = dayList.reduce((s, d) => s + d.count, 0);
  const avgRevenue = dayList.length > 0 ? totalRevenue / dayList.length : 0;
  const bestDay = dayList.length > 0
    ? dayList.reduce((max, d) => d.revenue > max.revenue ? d : max, dayList[0])
    : null;

  // Line chart: 560×160 viewBox, padding 8 kiri-kanan, 12 atas-bawah
  const W = 560;
  const H = 160;
  const PAD_X = 8;
  const PAD_Y = 20;
  const chartW = W - PAD_X * 2;
  const chartH = H - PAD_Y * 2;
  const n = dayList.length;

  function xOf(i: number) {
    return PAD_X + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW);
  }
  function yOf(v: number) {
    const range = maxRevenue - minRevenue || 1;
    return PAD_Y + chartH - ((v - minRevenue) / range) * chartH;
  }

  const points = dayList.map((d, i) => ({ x: xOf(i), y: yOf(d.revenue), d }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = n > 0
    ? `${linePath} L${points[n - 1].x.toFixed(1)},${(PAD_Y + chartH).toFixed(1)} L${points[0].x.toFixed(1)},${(PAD_Y + chartH).toFixed(1)} Z`
    : "";

  return (
    <div className="w-full max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-zinc-900">Tren Penjualan Harian</h1>
        <PeriodTabs basePath={basePath} period={period} />
      </div>

      {period === "custom" && (
        <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
          <input type="hidden" name="period" value="custom" />
          <label className="text-xs font-medium text-zinc-600">
            Dari
            <input type="date" name="from" defaultValue={from}
              className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Sampai
            <input type="date" name="to" defaultValue={to}
              className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm" />
          </label>
          <button type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700">
            Terapkan
          </button>
        </form>
      )}

      {dayList.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-400">
          Belum ada data untuk periode ini.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          {p.show_amount && (
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-zinc-100 bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Total</p>
                <p className="mt-1 text-base font-bold text-zinc-900">{fmt(totalRevenue)}</p>
                <p className="text-[11px] text-zinc-400">{totalCount} transaksi</p>
              </div>
              <div className="rounded-xl border border-zinc-100 bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Rata-rata/Hari</p>
                <p className="mt-1 text-base font-bold text-zinc-900">{fmt(avgRevenue)}</p>
                <p className="text-[11px] text-zinc-400">{dayList.length} hari</p>
              </div>
              {bestDay && (
                <div className="rounded-xl border border-zinc-100 bg-white px-4 py-3 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Tertinggi</p>
                  <p className="mt-1 text-base font-bold text-brand-700">{fmt(bestDay.revenue)}</p>
                  <p className="text-[11px] text-zinc-400">{formatDateLabel(bestDay.date)}</p>
                </div>
              )}
            </div>
          )}

          {/* Line chart */}
          {p.show_amount && n > 0 && (
            <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white p-4">
              <div className="overflow-x-auto">
                <svg
                  viewBox={`0 0 ${W} ${H + 28}`}
                  width="100%"
                  style={{ minWidth: Math.max(300, n * 40) }}
                  className="block"
                >
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#16a34a" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {/* Garis referensi horizontal */}
                  {[0, 0.25, 0.5, 0.75, 1].map((r) => {
                    const y = PAD_Y + chartH - r * chartH;
                    const v = minRevenue + r * (maxRevenue - minRevenue);
                    return (
                      <g key={r}>
                        <line x1={PAD_X} y1={y} x2={W - PAD_X} y2={y}
                          stroke="#f4f4f5" strokeWidth={1} />
                        {r > 0 && r < 1 && (
                          <text x={PAD_X} y={y - 3} fontSize={8} fill="#d4d4d8">
                            {fmtShort(v)}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Area fill */}
                  {n > 1 && <path d={areaPath} fill="url(#areaGrad)" />}

                  {/* Garis */}
                  {n > 1 && (
                    <path d={linePath} fill="none" stroke="#16a34a" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  )}

                  {/* Titik + label */}
                  {points.map((pt, i) => {
                    const isMax = pt.d.revenue === maxRevenue;
                    const showLabel = n <= 14 || isMax;
                    return (
                      <g key={pt.d.date}>
                        <circle cx={pt.x} cy={pt.y} r={isMax ? 5 : 3.5}
                          fill={isMax ? "#16a34a" : "#fff"}
                          stroke="#16a34a" strokeWidth={isMax ? 0 : 2} />
                        {showLabel && (
                          <text x={pt.x} y={pt.y - 8}
                            textAnchor="middle" fontSize={8.5} fontWeight={isMax ? "700" : "400"}
                            fill={isMax ? "#16a34a" : "#71717a"}>
                            {fmtShort(pt.d.revenue)}
                          </text>
                        )}
                        {/* Label tanggal di bawah */}
                        <text x={pt.x} y={H + 16}
                          textAnchor="middle" fontSize={8} fill="#a1a1aa">
                          {formatDateLabelShort(pt.d.date)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          )}

          {/* Tabel detail */}
          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-100 bg-zinc-50">
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                    <th className="px-4 py-3">Tanggal</th>
                    <th className="px-4 py-3 text-right">Transaksi</th>
                    {p.show_amount && (
                      <>
                        <th className="px-4 py-3 text-right">Pendapatan</th>
                        <th className="px-4 py-3 text-right">Rata-rata</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {dayList.map((d, i) => (
                    <tr key={d.date}
                      className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}>
                      <td className="px-4 py-3 text-xs text-zinc-700 whitespace-nowrap">
                        {formatDateLabel(d.date)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-zinc-600">{d.count}</td>
                      {p.show_amount && (
                        <>
                          <td className="px-4 py-3 text-right text-xs font-semibold text-zinc-900">
                            {fmt(d.revenue)}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-zinc-400">
                            {fmt(d.count > 0 ? d.revenue / d.count : 0)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-zinc-200 bg-zinc-50">
                  <tr>
                    <td className="px-4 py-3 text-xs font-bold text-zinc-700">Total</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-zinc-800">{totalCount}</td>
                    {p.show_amount && (
                      <>
                        <td className="px-4 py-3 text-right text-sm font-bold text-zinc-900">
                          {fmt(totalRevenue)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-bold text-zinc-400">
                          {fmt(totalCount > 0 ? totalRevenue / totalCount : 0)}
                        </td>
                      </>
                    )}
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
