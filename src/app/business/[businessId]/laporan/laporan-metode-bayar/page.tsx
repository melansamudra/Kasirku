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

const METHOD_LABEL: Record<string, string> = {
  cash: "Tunai",
  qris: "QRIS",
  edc: "EDC / Debit",
  transfer: "Transfer",
};

function labelMethod(m: string) {
  return METHOD_LABEL[m.toLowerCase()] ?? m;
}

export default async function MirrorLaporanMetodeBayarPage({
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
    ? { show_transactions: true, show_payment_method: true, show_amount: true }
    : (mirrorAccount!.permissions ?? {}) as { show_transactions?: boolean; show_payment_method?: boolean; show_amount?: boolean };

  if (!p.show_transactions || !p.show_payment_method) notFound();

  const basePath = `/business/${businessId}/laporan/laporan-metode-bayar`;

  const { data: rows } = await service
    .from("mirror_visible_transactions")
    .select(
      `transactions!mirror_visible_transactions_transaction_id_fkey(
        id, date, voided,
        transaction_payments(method, amount)
      )`,
    )
    .eq("business_id", businessId);

  // Agregasi per metode bayar
  const methodMap = new Map<string, { txIds: Set<string>; total: number }>();

  for (const row of rows ?? []) {
    const t = row.transactions as unknown as {
      id: string;
      date: string;
      voided: boolean;
      transaction_payments: { method: string; amount: number }[] | null;
    } | null;
    if (!t || t.voided) continue;
    if (fromIso && t.date < fromIso) continue;
    if (toIsoExclusive && t.date >= toIsoExclusive) continue;

    for (const pay of t.transaction_payments ?? []) {
      const key = pay.method.toLowerCase();
      const existing = methodMap.get(key);
      if (existing) {
        existing.txIds.add(t.id);
        existing.total += Number(pay.amount);
      } else {
        methodMap.set(key, { txIds: new Set([t.id]), total: Number(pay.amount) });
      }
    }
  }

  const methodList = Array.from(methodMap.entries())
    .map(([method, { txIds, total }]) => ({ method, txCount: txIds.size, total }))
    .sort((a, b) => b.total - a.total);

  const grandTotal = methodList.reduce((s, m) => s + m.total, 0);

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-zinc-900">Laporan per Metode Bayar</h1>
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

      {methodList.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-400">
          Belum ada data untuk periode ini.
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                <th className="px-4 py-3">Metode Bayar</th>
                <th className="px-4 py-3 text-right">Transaksi</th>
                {p.show_amount && (
                  <>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">%</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {methodList.map((m, i) => (
                <tr key={m.method}
                  className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}>
                  <td className="px-4 py-3 text-xs font-medium text-zinc-800">
                    {labelMethod(m.method)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-zinc-600">{m.txCount}</td>
                  {p.show_amount && (
                    <>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-zinc-900">
                        {fmt(m.total)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-zinc-400">
                        {grandTotal > 0 ? `${Math.round((m.total / grandTotal) * 100)}%` : "—"}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-zinc-200 bg-zinc-50">
              <tr>
                <td className="px-4 py-3 text-xs font-bold text-zinc-700">Total</td>
                <td className="px-4 py-3 text-right text-xs font-bold text-zinc-800">
                  {methodList.reduce((s, m) => s + m.txCount, 0)}
                </td>
                {p.show_amount && (
                  <>
                    <td className="px-4 py-3 text-right text-sm font-bold text-zinc-900">
                      {fmt(grandTotal)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-zinc-400">100%</td>
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
