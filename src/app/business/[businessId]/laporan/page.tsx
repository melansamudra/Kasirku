import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  PERIOD_COOKIE_NAME,
  getPeriodRange,
  parsePeriod,
} from "../(dashboard)/reports/period";
import PeriodTabs from "../(dashboard)/reports/period-tabs";

function fmt(v: number) {
  return `Rp${Math.round(v).toLocaleString("id-ID")}`;
}
function fmtCompact(v: number) {
  if (v >= 1_000_000_000) return `Rp${(v / 1_000_000_000).toFixed(1)}M`;
  if (v >= 1_000_000) return `Rp${(v / 1_000_000).toFixed(1)}Jt`;
  if (v >= 1_000) return `Rp${(v / 1_000).toFixed(0)}Rb`;
  return `Rp${Math.round(v).toLocaleString("id-ID")}`;
}
function fmtShort(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}jt`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}rb`;
  return String(Math.round(v));
}
function toDateWib(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 10);
}
function formatDateLabel(d: string) {
  return new Date(d).toLocaleDateString("id-ID", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}
function formatDateShort(d: string) {
  return new Date(d).toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", timeZone: "Asia/Jakarta",
  });
}

type TxData = {
  date: string;
  total: number;
  subtotal_raw: number;
  subtotal: number;
  total_item_disc: number;
  order_disc_amt: number;
  service: number;
  tax: number;
};

type DayRow = {
  date: string;
  grandTotal: number;
  diskon: number;
  subtotal: number;
  service: number;
  tax: number;
  billCount: number;
};

export default async function LaporanRingkasanPage({
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

  const basePath = `/business/${businessId}/laporan`;

  // ── Ambil data transaksi ────────────────────────────────────────────────
  let txList: TxData[] = [];

  if (isOwner) {
    // Owner: ambil semua transaksi langsung dari tabel transactions
    let q = service
      .from("transactions")
      .select("date, total, subtotal_raw, subtotal, total_item_disc, order_disc_amt, service, tax")
      .eq("business_id", businessId)
      .eq("voided", false);
    if (fromIso) q = q.gte("date", fromIso);
    if (toIsoExclusive) q = q.lt("date", toIsoExclusive);
    const { data: rows } = await q;
    txList = (rows ?? []).map((r) => ({
      date: r.date,
      total: Number(r.total),
      subtotal_raw: Number(r.subtotal_raw ?? 0),
      subtotal: Number(r.subtotal ?? 0),
      total_item_disc: Number(r.total_item_disc ?? 0),
      order_disc_amt: Number(r.order_disc_amt ?? 0),
      service: Number(r.service ?? 0),
      tax: Number(r.tax ?? 0),
    }));
  } else if (p.show_transactions) {
    // Mirror: ambil dari mirror_visible_transactions
    const { data: rows } = await service
      .from("mirror_visible_transactions")
      .select(`transactions!mirror_visible_transactions_transaction_id_fkey(
        date, total, subtotal_raw, subtotal, total_item_disc, order_disc_amt, service, tax, voided
      )`)
      .eq("business_id", businessId);

    txList = (rows ?? [])
      .map((row) => {
        const t = row.transactions as unknown as TxData & { voided: boolean } | null;
        if (!t || t.voided) return null;
        if (fromIso && t.date < fromIso) return null;
        if (toIsoExclusive && t.date >= toIsoExclusive) return null;
        return {
          date: t.date,
          total: Number(t.total),
          subtotal_raw: Number(t.subtotal_raw ?? 0),
          subtotal: Number(t.subtotal ?? 0),
          total_item_disc: Number(t.total_item_disc ?? 0),
          order_disc_amt: Number(t.order_disc_amt ?? 0),
          service: Number(t.service ?? 0),
          tax: Number(t.tax ?? 0),
        };
      })
      .filter(Boolean) as TxData[];
  }

  // ── Agregasi per hari ───────────────────────────────────────────────────
  const dayMap = new Map<string, DayRow>();
  for (const t of txList) {
    const key = toDateWib(t.date);
    const existing = dayMap.get(key);
    const diskon = t.total_item_disc + t.order_disc_amt;
    if (existing) {
      existing.grandTotal += t.total;
      existing.diskon += diskon;
      existing.subtotal += t.subtotal;
      existing.service += t.service;
      existing.tax += t.tax;
      existing.billCount += 1;
    } else {
      dayMap.set(key, {
        date: key,
        grandTotal: t.total,
        diskon,
        subtotal: t.subtotal,
        service: t.service,
        tax: t.tax,
        billCount: 1,
      });
    }
  }
  const dayList = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const totalPendapatan = dayList.reduce((s, d) => s + d.grandTotal, 0);
  const totalBill = dayList.reduce((s, d) => s + d.billCount, 0);
  const totalDiskon = dayList.reduce((s, d) => s + d.diskon, 0);
  const totalTax = dayList.reduce((s, d) => s + d.tax, 0);
  const avgPerBill = totalBill > 0 ? totalPendapatan / totalBill : 0;
  const bestDay = dayList.length > 0
    ? dayList.reduce((max, d) => d.grandTotal > max.grandTotal ? d : max, dayList[0])
    : null;

  // ── SVG Line Chart ──────────────────────────────────────────────────────
  const n = dayList.length;
  const W = 560, H = 120, PX = 8, PY = 16;
  const chartW = W - PX * 2;
  const chartH = H - PY * 2;
  const maxRev = Math.max(...dayList.map((d) => d.grandTotal), 1);
  const minRev = Math.min(...dayList.map((d) => d.grandTotal), 0);
  function xOf(i: number) { return PX + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW); }
  function yOf(v: number) {
    const range = maxRev - minRev || 1;
    return PY + chartH - ((v - minRev) / range) * chartH;
  }
  const pts = dayList.map((d, i) => ({ x: xOf(i), y: yOf(d.grandTotal), d }));
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = n > 0
    ? `${linePath} L${pts[n - 1].x.toFixed(1)},${(PY + chartH).toFixed(1)} L${pts[0].x.toFixed(1)},${(PY + chartH).toFixed(1)} Z`
    : "";

  return (
    <div className="w-full max-w-5xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Ringkasan Laporan</h1>
          <p className="mt-0.5 text-xs text-zinc-400">Data penjualan dari POS Kasir</p>
        </div>
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

      {txList.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-6 py-12 text-center">
          <p className="text-3xl mb-3">📊</p>
          <p className="text-sm font-medium text-zinc-700">Belum ada data untuk periode ini</p>
          <p className="mt-1 text-xs text-zinc-400">
            {isOwner ? "Belum ada transaksi di periode yang dipilih." : "Pemilik toko belum mengaktifkan data untuk akun Anda."}
          </p>
        </div>
      ) : (
        <>
          {/* ── Stat Cards ── */}
          {p.show_amount && (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/* Pendapatan */}
              <div className="rounded-2xl bg-brand-600 p-4 text-white">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide opacity-80">Pendapatan</p>
                <p className="mt-2 text-xl font-bold leading-tight">{fmtCompact(totalPendapatan)}</p>
                <p className="mt-1 text-[11px] opacity-70">{fmt(totalPendapatan)}</p>
              </div>

              {/* Transaksi */}
              <div className="rounded-2xl bg-white border border-zinc-100 p-4 shadow-sm">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">Transaksi</p>
                <p className="mt-2 text-xl font-bold text-zinc-900">{totalBill.toLocaleString("id-ID")}</p>
                <p className="mt-1 text-[11px] text-zinc-400">{dayList.length} hari</p>
              </div>

              {/* Rata-rata */}
              <div className="rounded-2xl bg-white border border-zinc-100 p-4 shadow-sm">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">Rata-rata/Bill</p>
                <p className="mt-2 text-xl font-bold text-zinc-900">{fmtCompact(avgPerBill)}</p>
                <p className="mt-1 text-[11px] text-zinc-400">{fmt(avgPerBill)}</p>
              </div>

              {/* Hari Terbaik */}
              {bestDay && (
                <div className="rounded-2xl bg-white border border-zinc-100 p-4 shadow-sm">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">Hari Terbaik</p>
                  <p className="mt-2 text-xl font-bold text-brand-700">{fmtCompact(bestDay.grandTotal)}</p>
                  <p className="mt-1 text-[11px] text-zinc-400">{formatDateShort(bestDay.date)}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Ringkasan tanpa amount (mirror tanpa izin) ── */}
          {!p.show_amount && (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-brand-600 p-4 text-white">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide opacity-80">Transaksi</p>
                <p className="mt-2 text-2xl font-bold">{totalBill.toLocaleString("id-ID")}</p>
                <p className="mt-1 text-[11px] opacity-70">{dayList.length} hari aktif</p>
              </div>
              <div className="rounded-2xl bg-white border border-zinc-100 p-4 shadow-sm">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">Hari Terbaik</p>
                <p className="mt-2 text-xl font-bold text-zinc-900">{bestDay ? bestDay.billCount : "—"} bill</p>
                <p className="mt-1 text-[11px] text-zinc-400">{bestDay ? formatDateShort(bestDay.date) : ""}</p>
              </div>
              <div className="rounded-2xl bg-white border border-zinc-100 p-4 shadow-sm">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">Rata-rata/Hari</p>
                <p className="mt-2 text-xl font-bold text-zinc-900">
                  {dayList.length > 0 ? Math.round(totalBill / dayList.length).toLocaleString("id-ID") : "—"} bill
                </p>
                <p className="mt-1 text-[11px] text-zinc-400">per hari aktif</p>
              </div>
            </div>
          )}

          {/* ── Diskon & Pajak ringkasan ── */}
          {p.show_amount && (totalDiskon > 0 || totalTax > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {totalDiskon > 0 && (
                <div className="flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600">
                  <span>Diskon</span>
                  <span className="font-bold">−{fmt(totalDiskon)}</span>
                </div>
              )}
              {totalTax > 0 && (
                <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                  <span>PPN/Tax</span>
                  <span className="font-bold">+{fmt(totalTax)}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Line Chart ── */}
          {p.show_amount && n > 1 && (
            <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Tren Pendapatan</p>
              <div className="overflow-x-auto">
                <svg viewBox={`0 0 ${W} ${H + 20}`} width="100%"
                  style={{ minWidth: Math.max(280, n * 36) }} className="block">
                  <defs>
                    <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#16a34a" stopOpacity="0.18" />
                      <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[0, 0.5, 1].map((r) => (
                    <line key={r} x1={PX} y1={PY + chartH - r * chartH}
                      x2={W - PX} y2={PY + chartH - r * chartH}
                      stroke="#f4f4f5" strokeWidth={1} />
                  ))}
                  <path d={areaPath} fill="url(#lg)" />
                  <path d={linePath} fill="none" stroke="#16a34a" strokeWidth={2.5}
                    strokeLinejoin="round" strokeLinecap="round" />
                  {pts.map((pt, i) => {
                    const isMax = pt.d.grandTotal === maxRev;
                    return (
                      <g key={pt.d.date}>
                        <circle cx={pt.x} cy={pt.y} r={isMax ? 5 : 3.5}
                          fill={isMax ? "#16a34a" : "#fff"}
                          stroke="#16a34a" strokeWidth={isMax ? 0 : 2} />
                        {(n <= 14 || isMax) && (
                          <text x={pt.x} y={pt.y - 9} textAnchor="middle"
                            fontSize={8.5} fontWeight={isMax ? "700" : "400"}
                            fill={isMax ? "#16a34a" : "#a1a1aa"}>
                            {fmtShort(pt.d.grandTotal)}
                          </text>
                        )}
                        <text x={pt.x} y={H + 14} textAnchor="middle" fontSize={8} fill="#d4d4d8">
                          {formatDateShort(pt.d.date)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          )}

          {/* ── Tabel Harian ── */}
          <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
            <div className="border-b border-zinc-50 px-5 py-3.5">
              <p className="text-sm font-semibold text-zinc-800">Rincian per Hari</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-100 bg-zinc-50/60">
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                    <th className="px-5 py-3">Tanggal</th>
                    <th className="px-5 py-3 text-right">Bill</th>
                    {p.show_amount && (
                      <>
                        <th className="px-5 py-3 text-right">Diskon</th>
                        <th className="px-5 py-3 text-right">Tax</th>
                        <th className="px-5 py-3 text-right">Total</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {[...dayList].reverse().map((d, i) => (
                    <tr key={d.date}
                      className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}>
                      <td className="px-5 py-3 text-xs font-medium text-zinc-700 whitespace-nowrap">
                        {formatDateLabel(d.date)}
                      </td>
                      <td className="px-5 py-3 text-right text-xs text-zinc-600">{d.billCount}</td>
                      {p.show_amount && (
                        <>
                          <td className="px-5 py-3 text-right text-xs text-red-500">
                            {d.diskon > 0 ? `−${fmt(d.diskon)}` : <span className="text-zinc-300">—</span>}
                          </td>
                          <td className="px-5 py-3 text-right text-xs text-zinc-500">
                            {d.tax > 0 ? fmt(d.tax) : <span className="text-zinc-300">—</span>}
                          </td>
                          <td className="px-5 py-3 text-right text-xs font-bold text-zinc-900">
                            {fmt(d.grandTotal)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                {p.show_amount && dayList.length > 1 && (
                  <tfoot className="border-t-2 border-zinc-100 bg-zinc-50">
                    <tr>
                      <td className="px-5 py-3 text-xs font-bold text-zinc-700">
                        Total ({totalBill} bill)
                      </td>
                      <td className="px-5 py-3 text-right text-xs font-bold text-zinc-700">{totalBill}</td>
                      <td className="px-5 py-3 text-right text-xs font-bold text-red-500">
                        {totalDiskon > 0 ? `−${fmt(totalDiskon)}` : <span className="text-zinc-300">—</span>}
                      </td>
                      <td className="px-5 py-3 text-right text-xs font-bold text-zinc-500">
                        {totalTax > 0 ? fmt(totalTax) : <span className="text-zinc-300">—</span>}
                      </td>
                      <td className="px-5 py-3 text-right text-sm font-bold text-zinc-900">
                        {fmt(totalPendapatan)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
