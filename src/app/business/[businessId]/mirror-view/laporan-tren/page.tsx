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

  const service = createServiceClient();

  const { data: mirrorAccount } = await service
    .from("mirror_accounts")
    .select("id, permissions")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!mirrorAccount) notFound();

  const p = (mirrorAccount.permissions ?? {}) as {
    show_transactions?: boolean;
    show_amount?: boolean;
  };

  if (!p.show_transactions) notFound();

  const basePath = `/business/${businessId}/mirror-view/laporan-tren`;

  const { data: rows } = await service
    .from("mirror_visible_transactions")
    .select(
      `transactions!mirror_visible_transactions_transaction_id_fkey(
        date, total, voided
      )`,
    )
    .eq("business_id", businessId);

  // Agregasi per tanggal WIB
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
  const totalRevenue = dayList.reduce((s, d) => s + d.revenue, 0);
  const totalCount = dayList.reduce((s, d) => s + d.count, 0);
  const avgRevenue = dayList.length > 0 ? totalRevenue / dayList.length : 0;

  // Dimensi bar chart
  const CHART_H = 160;
  const BAR_GAP = 4;
  const MIN_BAR_W = 20;
  const barCount = dayList.length;
  const barW = Math.max(MIN_BAR_W, Math.min(48, Math.floor((600 - barCount * BAR_GAP) / barCount)));
  const chartW = barCount * (barW + BAR_GAP);

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
              <div className="rounded-xl border border-zinc-100 bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Tertinggi</p>
                <p className="mt-1 text-base font-bold text-brand-700">
                  {fmt(Math.max(...dayList.map((d) => d.revenue)))}
                </p>
                <p className="text-[11px] text-zinc-400">
                  {formatDateLabel(dayList.reduce((max, d) => d.revenue > max.revenue ? d : max, dayList[0]).date)}
                </p>
              </div>
            </div>
          )}

          {/* Bar chart */}
          {p.show_amount && dayList.length > 1 && (
            <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white p-4">
              <div className="overflow-x-auto">
                <svg
                  viewBox={`0 0 ${chartW + 8} ${CHART_H + 36}`}
                  width={chartW + 8}
                  className="block"
                  style={{ minWidth: "100%" }}
                >
                  {/* Garis referensi */}
                  {[0.25, 0.5, 0.75, 1].map((ratio) => {
                    const y = CHART_H - CHART_H * ratio;
                    return (
                      <line key={ratio} x1={0} y1={y} x2={chartW + 8} y2={y}
                        stroke="#f4f4f5" strokeWidth={1} />
                    );
                  })}

                  {dayList.map((d, i) => {
                    const barH = Math.max(4, Math.round((d.revenue / maxRevenue) * CHART_H));
                    const x = i * (barW + BAR_GAP);
                    const y = CHART_H - barH;
                    const isMax = d.revenue === maxRevenue;
                    return (
                      <g key={d.date}>
                        <rect
                          x={x} y={y} width={barW} height={barH}
                          rx={3}
                          fill={isMax ? "#16a34a" : "#4ade80"}
                        />
                        {/* Label nilai di atas bar (hanya kalau cukup ruang) */}
                        {barW >= 32 && (
                          <text
                            x={x + barW / 2} y={y - 3}
                            textAnchor="middle"
                            fontSize={8}
                            fill="#52525b"
                          >
                            {fmtShort(d.revenue)}
                          </text>
                        )}
                        {/* Label tanggal di bawah */}
                        <text
                          x={x + barW / 2} y={CHART_H + 14}
                          textAnchor="middle"
                          fontSize={8}
                          fill="#a1a1aa"
                          transform={barW < 28 ? `rotate(-45, ${x + barW / 2}, ${CHART_H + 14})` : undefined}
                        >
                          {formatDateLabel(d.date)}
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
