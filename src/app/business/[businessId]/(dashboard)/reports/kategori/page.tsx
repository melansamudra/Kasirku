import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { PERIOD_COOKIE_NAME, getPeriodRange, parsePeriod } from "../period";
import PeriodTabs from "../period-tabs";

function fmt(v: number) { return `Rp${Math.round(v).toLocaleString("id-ID")}`; }

const PALETTE = [
  "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#f43f5e",
  "#06b6d4", "#84cc16", "#ec4899", "#6366f1", "#14b8a6",
];

export default async function ReportsKategoriPage({
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
    .select("transaction_items(name, qty, price, category)")
    .eq("business_id", businessId)
    .eq("voided", false);
  if (fromIso) q = q.gte("date", fromIso);
  if (toIsoExclusive) q = q.lt("date", toIsoExclusive);
  const { data: rows } = await q;

  const catMap = new Map<string, { qty: number; revenue: number; itemCount: number }>();
  for (const t of rows ?? []) {
    for (const item of t.transaction_items ?? []) {
      const cat = item.category ?? "Lainnya";
      const qty = Number(item.qty);
      const revenue = qty * Number(item.price);
      const e = catMap.get(cat) ?? { qty: 0, revenue: 0, itemCount: 0 };
      e.qty += qty;
      e.revenue += revenue;
      e.itemCount += 1;
      catMap.set(cat, e);
    }
  }

  const catList = Array.from(catMap.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = catList.reduce((s, c) => s + c.revenue, 0);
  const totalQty = catList.reduce((s, c) => s + c.qty, 0);
  const basePath = `/business/${businessId}/reports/kategori`;

  return (
    <div className="w-full max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-zinc-900">Laporan Kategori Menu</h1>
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

      {catList.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-400">
          Belum ada data untuk periode ini.
        </div>
      ) : (
        <>
          {/* Visual bars */}
          <div className="mt-5 space-y-2">
            {catList.map((c, i) => {
              const pct = totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0;
              return (
                <div key={c.category} className="overflow-hidden rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                      <span className="text-sm font-semibold text-zinc-900">{c.category}</span>
                    </div>
                    <span className="text-xs font-bold text-zinc-400">{Math.round(pct)}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }} />
                  </div>
                  <div className="mt-2 flex justify-between text-[11px] text-zinc-400">
                    <span>{c.qty % 1 === 0 ? c.qty : c.qty.toFixed(1)} qty terjual</span>
                    <span className="font-semibold text-zinc-700">{fmt(c.revenue)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tabel ringkasan */}
          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-100 bg-zinc-50">
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                    <th className="px-4 py-3">Kategori</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Omset</th>
                    <th className="px-4 py-3 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {catList.map((c, i) => {
                    const pct = totalRevenue > 0 ? Math.round((c.revenue / totalRevenue) * 100) : 0;
                    return (
                      <tr key={c.category} className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                            <span className="text-xs font-medium text-zinc-800">{c.category}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-zinc-600">
                          {c.qty % 1 === 0 ? c.qty : c.qty.toFixed(1)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-zinc-900">{fmt(c.revenue)}</td>
                        <td className="px-4 py-3 text-right text-xs font-bold text-zinc-400">{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-zinc-200 bg-zinc-50">
                  <tr>
                    <td className="px-4 py-3 text-xs font-bold text-zinc-700">Total ({catList.length} kategori)</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-zinc-800">
                      {totalQty % 1 === 0 ? totalQty : totalQty.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-zinc-900">{fmt(totalRevenue)}</td>
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
