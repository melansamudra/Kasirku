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

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export default async function MirrorLaporanTransaksiPage({
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
    ? { show_transactions: true, show_amount: true, show_items: true }
    : (mirrorAccount!.permissions ?? {}) as { show_transactions?: boolean; show_amount?: boolean; show_items?: boolean };

  if (!p.show_transactions) notFound();

  const basePath = `/business/${businessId}/laporan/laporan-transaksi`;

  const { data: rows } = await service
    .from("mirror_visible_transactions")
    .select(
      `transactions!mirror_visible_transactions_transaction_id_fkey(
        id, date, invoice_number, total, subtotal_raw, subtotal,
        total_item_disc, order_disc_amt, service, tax, voided,
        transaction_items(qty)
      )`,
    )
    .eq("business_id", businessId);

  type TxRow = {
    id: string;
    date: string;
    invoice_number: string;
    total: number;
    subtotal_raw: number;
    subtotal: number;
    total_item_disc: number;
    order_disc_amt: number;
    service: number;
    tax: number;
    totalMenuQty: number;
  };

  const txList: TxRow[] = (rows ?? [])
    .map((row) => {
      const t = row.transactions as unknown as {
        id: string;
        date: string;
        invoice_number: string;
        total: number;
        subtotal_raw: number;
        subtotal: number;
        total_item_disc: number;
        order_disc_amt: number;
        service: number;
        tax: number;
        voided: boolean;
        transaction_items: { qty: number }[] | null;
      } | null;
      if (!t || t.voided) return null;
      if (fromIso && t.date < fromIso) return null;
      if (toIsoExclusive && t.date >= toIsoExclusive) return null;
      return {
        id: t.id,
        date: t.date,
        invoice_number: t.invoice_number,
        total: Number(t.total),
        subtotal_raw: Number(t.subtotal_raw),
        subtotal: Number(t.subtotal),
        total_item_disc: Number(t.total_item_disc),
        order_disc_amt: Number(t.order_disc_amt),
        service: Number(t.service),
        tax: Number(t.tax),
        totalMenuQty: (t.transaction_items ?? []).reduce((s, i) => s + Number(i.qty), 0),
      };
    })
    .filter(Boolean) as TxRow[];

  txList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totals = txList.reduce(
    (acc, t) => ({
      nilaiMenu:  acc.nilaiMenu  + t.subtotal_raw,
      diskon:     acc.diskon     + t.total_item_disc + t.order_disc_amt,
      subtotal:   acc.subtotal   + t.subtotal,
      service:    acc.service    + t.service,
      tax:        acc.tax        + t.tax,
      grandTotal: acc.grandTotal + t.total,
      totalMenuQty: acc.totalMenuQty + t.totalMenuQty,
    }),
    { nilaiMenu: 0, diskon: 0, subtotal: 0, service: 0, tax: 0, grandTotal: 0, totalMenuQty: 0 },
  );

  return (
    <div className="w-full max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-zinc-900">Laporan per Transaksi</h1>
        <PeriodTabs basePath={basePath} period={period} />
      </div>

      {period === "custom" && (
        <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
          <input type="hidden" name="period" value="custom" />
          <label className="text-xs font-medium text-zinc-600">
            Dari
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Sampai
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Terapkan
          </button>
        </form>
      )}

      {txList.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-400">
          Belum ada transaksi untuk periode ini.
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-3">Tanggal</th>
                  {p.show_amount && (
                    <>
                      <th className="px-4 py-3 text-right">Nilai Menu</th>
                      <th className="px-4 py-3 text-right">Diskon</th>
                      <th className="px-4 py-3 text-right">Subtotal</th>
                      <th className="px-4 py-3 text-right">Service</th>
                      <th className="px-4 py-3 text-right">Tax</th>
                    </>
                  )}
                  <th className="px-4 py-3 text-right">Total Menu</th>
                  {p.show_amount && (
                    <th className="px-4 py-3 text-right">Grand Total</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {txList.map((t, i) => {
                  const diskon = t.total_item_disc + t.order_disc_amt;
                  return (
                    <tr
                      key={t.id}
                      className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}
                    >
                      <td className="px-4 py-3 text-xs text-zinc-700 whitespace-nowrap">
                        {formatDateTime(t.date)}
                      </td>
                      {p.show_amount && (
                        <>
                          <td className="px-4 py-3 text-right text-xs text-zinc-700">
                            {fmt(t.subtotal_raw)}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-red-500">
                            {diskon > 0 ? `-${fmt(diskon)}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-zinc-700">
                            {fmt(t.subtotal)}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-zinc-500">
                            {t.service > 0 ? fmt(t.service) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-zinc-500">
                            {t.tax > 0 ? fmt(t.tax) : "—"}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3 text-right text-xs font-medium text-zinc-800">
                        {t.totalMenuQty % 1 === 0 ? t.totalMenuQty : t.totalMenuQty.toFixed(1)}
                      </td>
                      {p.show_amount && (
                        <td className="px-4 py-3 text-right text-xs font-bold text-zinc-900">
                          {fmt(t.total)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-zinc-200 bg-zinc-50">
                <tr>
                  <td className="px-4 py-3 text-xs font-bold text-zinc-700">
                    Total ({txList.length} transaksi)
                  </td>
                  {p.show_amount && (
                    <>
                      <td className="px-4 py-3 text-right text-xs font-bold text-zinc-700">
                        {fmt(totals.nilaiMenu)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-bold text-red-500">
                        {totals.diskon > 0 ? `-${fmt(totals.diskon)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-bold text-zinc-700">
                        {fmt(totals.subtotal)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-bold text-zinc-500">
                        {totals.service > 0 ? fmt(totals.service) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-bold text-zinc-500">
                        {totals.tax > 0 ? fmt(totals.tax) : "—"}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 text-right text-xs font-bold text-zinc-800">
                    {totals.totalMenuQty % 1 === 0 ? totals.totalMenuQty : totals.totalMenuQty.toFixed(1)}
                  </td>
                  {p.show_amount && (
                    <td className="px-4 py-3 text-right text-sm font-bold text-zinc-900">
                      {fmt(totals.grandTotal)}
                    </td>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
