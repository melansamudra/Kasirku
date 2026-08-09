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

// Konversi ISO UTC ke string tanggal WIB (YYYY-MM-DD)
function toDateWib(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

export default async function MirrorLaporanPage({
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

  let isOwner = false;
  if (!mirrorAccount) {
    const { data: biz } = await service.from("businesses").select("owner_id").eq("id", businessId).single();
    isOwner = biz?.owner_id === user.id;
  }
  if (!mirrorAccount && !isOwner) notFound();

  const p = isOwner
    ? { show_transactions: true, show_amount: true }
    : (mirrorAccount!.permissions ?? {}) as { show_transactions?: boolean; show_amount?: boolean };

  const basePath = `/business/${businessId}/laporan`;

  if (!p.show_transactions) {
    return (
      <div className="w-full max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-bold text-zinc-900">Laporan</h1>
          <PeriodTabs basePath={basePath} period={period} />
        </div>
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center">
          <p className="text-2xl mb-2">👁</p>
          <p className="text-sm font-medium text-zinc-700">Belum ada data laporan</p>
          <p className="mt-1 text-xs text-zinc-400">
            Pemilik toko belum mengaktifkan data transaksi untuk akun mirror Anda.
          </p>
        </div>
      </div>
    );
  }

  const { data: rows } = await service
    .from("mirror_visible_transactions")
    .select(
      `transactions!mirror_visible_transactions_transaction_id_fkey(
        id, date, total, subtotal_raw, subtotal, total_item_disc, order_disc_amt, service, tax, voided
      )`,
    )
    .eq("business_id", businessId);

  type TxData = {
    id: string;
    date: string;
    total: number;
    subtotal_raw: number;
    subtotal: number;
    total_item_disc: number;
    order_disc_amt: number;
    service: number;
    tax: number;
    voided: boolean;
  };

  const txList: TxData[] = (rows ?? [])
    .map((row) => {
      const t = row.transactions as unknown as TxData | null;
      return t;
    })
    .filter((t): t is TxData => {
      if (!t || t.voided) return false;
      if (fromIso && t.date < fromIso) return false;
      if (toIsoExclusive && t.date >= toIsoExclusive) return false;
      return true;
    });

  // Agregasi per tanggal WIB
  type DayRow = {
    date: string;
    totalMenu: number;       // subtotal_raw (harga menu sebelum diskon)
    diskon: number;          // total_item_disc + order_disc_amt
    subtotal: number;        // setelah diskon, sebelum service & tax
    service: number;
    tax: number;
    grandTotal: number;      // total akhir
    billCount: number;       // jumlah transaksi
  };

  const dayMap = new Map<string, DayRow>();

  for (const t of txList) {
    const dateKey = toDateWib(t.date);
    const existing = dayMap.get(dateKey);
    const diskon = Number(t.total_item_disc) + Number(t.order_disc_amt);
    if (existing) {
      existing.totalMenu  += Number(t.subtotal_raw);
      existing.diskon     += diskon;
      existing.subtotal   += Number(t.subtotal);
      existing.service    += Number(t.service);
      existing.tax        += Number(t.tax);
      existing.grandTotal += Number(t.total);
      existing.billCount  += 1;
    } else {
      dayMap.set(dateKey, {
        date: dateKey,
        totalMenu:  Number(t.subtotal_raw),
        diskon,
        subtotal:   Number(t.subtotal),
        service:    Number(t.service),
        tax:        Number(t.tax),
        grandTotal: Number(t.total),
        billCount:  1,
      });
    }
  }

  const dayList = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const totals = dayList.reduce(
    (acc, d) => ({
      totalMenu:  acc.totalMenu  + d.totalMenu,
      diskon:     acc.diskon     + d.diskon,
      subtotal:   acc.subtotal   + d.subtotal,
      service:    acc.service    + d.service,
      tax:        acc.tax        + d.tax,
      grandTotal: acc.grandTotal + d.grandTotal,
      billCount:  acc.billCount  + d.billCount,
    }),
    { totalMenu: 0, diskon: 0, subtotal: 0, service: 0, tax: 0, grandTotal: 0, billCount: 0 },
  );

  return (
    <div className="w-full max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-zinc-900">Laporan</h1>
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

      {dayList.length === 0 ? (
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
                      <th className="px-4 py-3 text-right">Total Menu</th>
                      <th className="px-4 py-3 text-right">Diskon</th>
                      <th className="px-4 py-3 text-right">Subtotal</th>
                      <th className="px-4 py-3 text-right">Service</th>
                      <th className="px-4 py-3 text-right">Tax</th>
                    </>
                  )}
                  <th className="px-4 py-3 text-right">Total Bill</th>
                  {p.show_amount && (
                    <th className="px-4 py-3 text-right">Grand Total</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {dayList.map((d, i) => (
                  <tr
                    key={d.date}
                    className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}
                  >
                    <td className="px-4 py-3 text-xs text-zinc-700 whitespace-nowrap">
                      {formatDateLabel(d.date)}
                    </td>
                    {p.show_amount && (
                      <>
                        <td className="px-4 py-3 text-right text-xs text-zinc-700">
                          {fmt(d.totalMenu)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-red-500">
                          {d.diskon > 0 ? `-${fmt(d.diskon)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-zinc-700">
                          {fmt(d.subtotal)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-zinc-500">
                          {d.service > 0 ? fmt(d.service) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-zinc-500">
                          {d.tax > 0 ? fmt(d.tax) : "—"}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3 text-right text-xs font-medium text-zinc-800">
                      {d.billCount}
                    </td>
                    {p.show_amount && (
                      <td className="px-4 py-3 text-right text-xs font-bold text-zinc-900">
                        {fmt(d.grandTotal)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-zinc-200 bg-zinc-50">
                <tr>
                  <td className="px-4 py-3 text-xs font-bold text-zinc-700">Total</td>
                  {p.show_amount && (
                    <>
                      <td className="px-4 py-3 text-right text-xs font-bold text-zinc-700">
                        {fmt(totals.totalMenu)}
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
                    {totals.billCount}
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
