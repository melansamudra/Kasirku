import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { PERIOD_COOKIE_NAME, getPeriodRange, parsePeriod, REPORT_TIMEZONE } from "../period";
import PeriodTabs from "../period-tabs";

function fmt(v: number) { return `Rp${Math.round(v).toLocaleString("id-ID")}`; }
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: REPORT_TIMEZONE,
  });
}

export default async function ReportsPerTransaksiPage({
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
    invoice_number: string;
    date: string;
    subtotal_raw: number | null;
    subtotal: number | null;
    total_item_disc: number | null;
    order_disc_amt: number | null;
    service: number | null;
    tax: number | null;
    total: number;
    voided: boolean;
    transaction_items: { qty: number }[];
  }>((rangeFrom, rangeTo) => {
    let q = supabase
      .from("transactions")
      .select("id, invoice_number, date, subtotal_raw, subtotal, total_item_disc, order_disc_amt, service, tax, total, voided, transaction_items(qty)")
      .eq("business_id", businessId)
      .eq("voided", false)
      .order("date", { ascending: false })
      .range(rangeFrom, rangeTo);
    if (fromIso) q = q.gte("date", fromIso);
    if (toIsoExclusive) q = q.lt("date", toIsoExclusive);
    return q;
  });

  const txList = rows.map((t) => ({
    id: t.id,
    invoiceNumber: t.invoice_number,
    date: t.date,
    subtotalRaw: Number(t.subtotal_raw ?? 0),
    subtotal: Number(t.subtotal ?? 0),
    diskon: Number(t.total_item_disc ?? 0) + Number(t.order_disc_amt ?? 0),
    service: Number(t.service ?? 0),
    tax: Number(t.tax ?? 0),
    total: Number(t.total),
    totalQty: (t.transaction_items ?? []).reduce((s: number, i: { qty: number }) => s + Number(i.qty), 0),
  }));

  const totals = txList.reduce(
    (acc, t) => ({
      subtotalRaw: acc.subtotalRaw + t.subtotalRaw,
      diskon: acc.diskon + t.diskon,
      service: acc.service + t.service,
      tax: acc.tax + t.tax,
      total: acc.total + t.total,
      totalQty: acc.totalQty + t.totalQty,
    }),
    { subtotalRaw: 0, diskon: 0, service: 0, tax: 0, total: 0, totalQty: 0 },
  );
  const hasDiskon = txList.some((t) => t.diskon > 0);
  const hasService = txList.some((t) => t.service > 0);
  const hasTax = txList.some((t) => t.tax > 0);
  const basePath = `/business/${businessId}/reports/per-transaksi`;

  return (
    <div className="w-full max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-zinc-900">Laporan per Transaksi</h1>
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
                  <th className="px-4 py-3">Transaksi</th>
                  <th className="px-4 py-3 text-right">Nilai Menu</th>
                  {hasDiskon && <th className="px-4 py-3 text-right">Diskon</th>}
                  {hasService && <th className="px-4 py-3 text-right">Service</th>}
                  {hasTax && <th className="px-4 py-3 text-right">Tax</th>}
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Grand Total</th>
                </tr>
              </thead>
              <tbody>
                {txList.map((t, i) => (
                  <tr key={t.id} className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}>
                    <td className="px-4 py-3">
                      <Link href={`/business/${businessId}/transactions/${t.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
                        {t.invoiceNumber}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-zinc-400 whitespace-nowrap">{fmtDateTime(t.date)}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-zinc-700">{fmt(t.subtotalRaw)}</td>
                    {hasDiskon && (
                      <td className="px-4 py-3 text-right text-xs text-red-500">
                        {t.diskon > 0 ? `−${fmt(t.diskon)}` : <span className="text-zinc-300">—</span>}
                      </td>
                    )}
                    {hasService && (
                      <td className="px-4 py-3 text-right text-xs text-zinc-500">
                        {t.service > 0 ? fmt(t.service) : <span className="text-zinc-300">—</span>}
                      </td>
                    )}
                    {hasTax && (
                      <td className="px-4 py-3 text-right text-xs text-zinc-500">
                        {t.tax > 0 ? fmt(t.tax) : <span className="text-zinc-300">—</span>}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right text-xs text-zinc-600">
                      {t.totalQty % 1 === 0 ? t.totalQty : t.totalQty.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-zinc-900">{fmt(t.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-zinc-200 bg-zinc-50">
                <tr>
                  <td className="px-4 py-3 text-xs font-bold text-zinc-700">Total ({txList.length} transaksi)</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-zinc-700">{fmt(totals.subtotalRaw)}</td>
                  {hasDiskon && <td className="px-4 py-3 text-right text-xs font-bold text-red-500">{totals.diskon > 0 ? `−${fmt(totals.diskon)}` : "—"}</td>}
                  {hasService && <td className="px-4 py-3 text-right text-xs font-bold text-zinc-500">{totals.service > 0 ? fmt(totals.service) : "—"}</td>}
                  {hasTax && <td className="px-4 py-3 text-right text-xs font-bold text-zinc-500">{totals.tax > 0 ? fmt(totals.tax) : "—"}</td>}
                  <td className="px-4 py-3 text-right text-xs font-bold text-zinc-700">
                    {totals.totalQty % 1 === 0 ? totals.totalQty : totals.totalQty.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-zinc-900">{fmt(totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
