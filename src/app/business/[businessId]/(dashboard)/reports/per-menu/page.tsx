import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { PERIOD_COOKIE_NAME, getPeriodRange, parsePeriod } from "../period";
import PeriodTabs from "../period-tabs";

function fmt(v: number) { return `Rp${Math.round(v).toLocaleString("id-ID")}`; }

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function ReportsPerMenuPage({
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
    .select("date, voided, transaction_items(name, qty, price, product_id)")
    .eq("business_id", businessId)
    .eq("voided", false);
  if (fromIso) q = q.gte("date", fromIso);
  if (toIsoExclusive) q = q.lt("date", toIsoExclusive);
  const { data: rows } = await q;

  const menuMap = new Map<string, { qty: number; revenue: number; productId: string | null }>();
  for (const t of rows ?? []) {
    for (const item of t.transaction_items ?? []) {
      const name = item.name ?? "—";
      const qty = Number(item.qty);
      const revenue = qty * Number(item.price);
      const e = menuMap.get(name) ?? { qty: 0, revenue: 0, productId: item.product_id };
      e.qty += qty;
      e.revenue += revenue;
      menuMap.set(name, e);
    }
  }

  const menuList = Array.from(menuMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty);

  const productIds = menuList.map((m) => m.productId).filter((id): id is string => id !== null);
  const emojiMap = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: products } = await supabase.from("products").select("id, emoji").in("id", productIds);
    for (const p of products ?? []) if (p.emoji) emojiMap.set(p.id, p.emoji);
  }

  const totalQty = menuList.reduce((s, m) => s + m.qty, 0);
  const totalRevenue = menuList.reduce((s, m) => s + m.revenue, 0);
  const basePath = `/business/${businessId}/reports/per-menu`;

  return (
    <div className="w-full max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-zinc-900">Laporan per Menu</h1>
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

      {menuList.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-400">
          Belum ada data untuk periode ini.
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Menu</th>
                  <th className="px-4 py-3 text-right">Qty Terjual</th>
                  <th className="px-4 py-3 text-right">% Qty</th>
                  <th className="px-4 py-3 text-right">Pendapatan</th>
                  <th className="px-4 py-3 text-right">% Omset</th>
                </tr>
              </thead>
              <tbody>
                {menuList.map((m, i) => {
                  const emoji = (m.productId && emojiMap.get(m.productId)) || "🛍️";
                  const pctQty = totalQty > 0 ? Math.round((m.qty / totalQty) * 100) : 0;
                  const pctRev = totalRevenue > 0 ? Math.round((m.revenue / totalRevenue) * 100) : 0;
                  return (
                    <tr key={m.name} className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}>
                      <td className="px-4 py-3 text-center text-sm">
                        {MEDALS[i] ?? <span className="text-xs font-bold text-zinc-300">{i + 1}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-base leading-none">{emoji}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-zinc-900">{m.name}</p>
                            <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-zinc-100">
                              <div className="h-full rounded-full bg-brand-400" style={{ width: `${pctQty}%` }} />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-zinc-800">
                        {m.qty % 1 === 0 ? m.qty : m.qty.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-zinc-400">{pctQty}%</td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-zinc-900">{fmt(m.revenue)}</td>
                      <td className="px-4 py-3 text-right text-xs text-zinc-400">{pctRev}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-zinc-200 bg-zinc-50">
                <tr>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-xs font-bold text-zinc-700">Total ({menuList.length} menu)</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-zinc-800">
                    {totalQty % 1 === 0 ? totalQty : totalQty.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-zinc-400">100%</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-zinc-900">{fmt(totalRevenue)}</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-zinc-400">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
