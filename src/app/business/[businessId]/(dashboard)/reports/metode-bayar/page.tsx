import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { PERIOD_COOKIE_NAME, getPeriodRange, parsePeriod } from "../period";
import PeriodTabs from "../period-tabs";

function fmt(v: number) { return `Rp${Math.round(v).toLocaleString("id-ID")}`; }

const PALETTE = [
  "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#f43f5e",
  "#06b6d4", "#84cc16", "#ec4899", "#6366f1", "#14b8a6",
];

export default async function ReportsMetodeBayarPage({
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

  // Dibungkus fetchAllRows karena Supabase/PostgREST diam-diam memotong
  // hasil di 1000 baris kalau tidak di-paginate (lihat lib/pagination.ts).
  const rows = await fetchAllRows<{
    id: string;
    total: number;
    voided: boolean;
    transaction_payments: { method: string; amount: number }[];
  }>((rangeFrom, rangeTo) => {
    let q = supabase
      .from("transactions")
      .select("id, total, voided, transaction_payments(method, amount)")
      .eq("business_id", businessId)
      .eq("voided", false)
      .range(rangeFrom, rangeTo);
    if (fromIso) q = q.gte("date", fromIso);
    if (toIsoExclusive) q = q.lt("date", toIsoExclusive);
    return q;
  });

  const byMethod = new Map<string, { amount: number; txCount: number }>();
  let totalAmount = 0;

  for (const t of rows) {
    const txMethodsSeen = new Set<string>();
    for (const p of t.transaction_payments ?? []) {
      const amt = Number(p.amount);
      const e = byMethod.get(p.method) ?? { amount: 0, txCount: 0 };
      e.amount += amt;
      if (!txMethodsSeen.has(p.method)) { e.txCount += 1; txMethodsSeen.add(p.method); }
      byMethod.set(p.method, e);
      totalAmount += amt;
    }
  }

  const methodList = Array.from(byMethod.entries())
    .map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.amount - a.amount);

  const totalTx = rows?.length ?? 0;
  const basePath = `/business/${businessId}/reports/metode-bayar`;

  return (
    <div className="w-full max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-zinc-900">Laporan Metode Pembayaran</h1>
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

      {methodList.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-400">
          Belum ada data pembayaran untuk periode ini.
        </div>
      ) : (
        <>
          {/* Cards per metode */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {methodList.map((m, i) => {
              const pct = totalAmount > 0 ? Math.round((m.amount / totalAmount) * 100) : 0;
              return (
                <div key={m.method} className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <p className="text-xs font-semibold text-zinc-700">{m.method}</p>
                  </div>
                  <p className="text-lg font-bold text-zinc-900">{fmt(m.amount)}</p>
                  <div className="mt-2 flex justify-between text-[11px] text-zinc-400">
                    <span>{m.txCount} transaksi</span>
                    <span className="font-semibold">{pct}%</span>
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tabel detail */}
          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-100 bg-zinc-50">
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                    <th className="px-4 py-3">Metode Bayar</th>
                    <th className="px-4 py-3 text-right">Transaksi</th>
                    <th className="px-4 py-3 text-right">Jumlah</th>
                    <th className="px-4 py-3 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {methodList.map((m, i) => {
                    const pct = totalAmount > 0 ? Math.round((m.amount / totalAmount) * 100) : 0;
                    return (
                      <tr key={m.method} className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                            <span className="text-xs font-medium text-zinc-800">{m.method}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-zinc-600">{m.txCount}x</td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-zinc-900">{fmt(m.amount)}</td>
                        <td className="px-4 py-3 text-right text-xs font-bold text-zinc-400">{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-zinc-200 bg-zinc-50">
                  <tr>
                    <td className="px-4 py-3 text-xs font-bold text-zinc-700">Total</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-zinc-700">{totalTx}x</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-zinc-900">{fmt(totalAmount)}</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-zinc-400">100%</td>
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
