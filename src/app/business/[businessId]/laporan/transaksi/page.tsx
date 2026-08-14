import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

function formatRupiah(v: number) {
  return `Rp${Math.round(v).toLocaleString("id-ID")}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export default async function MirrorTransaksiPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: mirrorAccount }, { data: biz }] = await Promise.all([
    supabase.from("mirror_accounts").select("id, permissions").eq("business_id", businessId).maybeSingle(),
    supabase.from("businesses").select("owner_id").eq("id", businessId).maybeSingle(),
  ]);
  const isOwner = biz?.owner_id === user.id;
  if (!mirrorAccount && !isOwner) notFound();

  const service = createServiceClient();

  const p = isOwner
    ? { show_transactions: true, show_amount: true, show_cashier: true, show_customer: true, show_invoice_number: true, show_payment_method: true, show_items: true }
    : (mirrorAccount!.permissions ?? {}) as {
        show_transactions?: boolean;
        show_amount?: boolean;
        show_cashier?: boolean;
        show_customer?: boolean;
        show_invoice_number?: boolean;
        show_payment_method?: boolean;
        show_items?: boolean;
      };

  if (!p.show_transactions) notFound();

  const { data: rows } = await service
    .from("mirror_visible_transactions")
    .select(
      `transaction_id,
      transactions!mirror_visible_transactions_transaction_id_fkey(
        id, receipt_code, date, total, subtotal_raw, total_item_disc, order_disc_amt, service, tax,
        order_label, customer_name,
        cashiers!transactions_cashier_id_fkey(name),
        customers!transactions_customer_id_fkey(name),
        transaction_payments(method),
        transaction_items(qty, name, products(name))
      )`,
    )
    .eq("business_id", businessId)
    .order("transaction_id", { ascending: false });

  type TxRow = {
    id: string;
    receipt_code: string | null;
    date: string;
    total: number;
    subtotal_raw: number;
    total_item_disc: number;
    order_disc_amt: number;
    service: number;
    tax: number;
    order_label: string | null;
    cashier_name: string | null;
    customer_name: string | null;
    free_customer_name: string | null;
    payment_methods: string[];
    items: { qty: number; product_name: string }[];
  };

  const transactions: TxRow[] = (rows ?? [])
    .map((row) => {
      const t = row.transactions as unknown as {
        id: string;
        receipt_code: string | null;
        date: string;
        total: number;
        subtotal_raw: number;
        total_item_disc: number;
        order_disc_amt: number;
        service: number;
        tax: number;
        order_label: string | null;
        customer_name: string | null;
        cashiers: { name: string } | null;
        customers: { name: string } | null;
        transaction_payments: { method: string }[] | null;
        transaction_items: { qty: number; name: string; products: { name: string } | null }[] | null;
      } | null;
      if (!t) return null;
      return {
        id: t.id,
        receipt_code: t.receipt_code,
        date: t.date,
        total: Number(t.total),
        subtotal_raw: Number(t.subtotal_raw ?? 0),
        total_item_disc: Number(t.total_item_disc ?? 0),
        order_disc_amt: Number(t.order_disc_amt ?? 0),
        service: Number(t.service ?? 0),
        tax: Number(t.tax ?? 0),
        order_label: t.order_label ?? null,
        cashier_name: (t.cashiers as { name: string } | null)?.name ?? null,
        customer_name: (t.customers as { name: string } | null)?.name ?? null,
        free_customer_name: t.customer_name ?? null,
        payment_methods: (t.transaction_payments ?? []).map((p) => p.method),
        items: (t.transaction_items ?? [])
          .map((i) => ({
            qty: i.qty,
            product_name: (i.products as { name: string } | null)?.name ?? i.name ?? "—",
          }))
          .filter((i) => i.product_name !== "—"),
      };
    })
    .filter(Boolean) as TxRow[];

  transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalTx = transactions.reduce((s, t) => s + t.total, 0);

  const extraCols = [
    true, // tanggal selalu ada
    p.show_invoice_number,
    p.show_cashier,
    p.show_customer,
    p.show_payment_method,
  ].filter(Boolean).length;

  return (
    <div className="w-full">
      <h1 className="text-lg font-bold text-zinc-900">
        Riwayat Transaksi ({transactions.length})
      </h1>
      <p className="mt-1 text-sm text-zinc-500">Transaksi yang dibagikan oleh pemilik toko</p>

      {transactions.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-400">
          Belum ada transaksi yang dibagikan.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50">
                <tr className="text-left text-[10px] font-semibold uppercase text-zinc-400">
                  <th className="px-4 py-3">Tanggal</th>
                  {p.show_invoice_number && <th className="px-4 py-3">No. Struk</th>}
                  {p.show_cashier && <th className="px-4 py-3">Kasir</th>}
                  {p.show_customer && <th className="px-4 py-3">Bon / Pelanggan</th>}
                  {p.show_payment_method && <th className="px-4 py-3">Metode Bayar</th>}
                  {p.show_amount && <th className="px-4 py-3 text-right">Total</th>}
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, i) => {
                  const totalDisc = t.total_item_disc + t.order_disc_amt;
                  const hasBreakdown = p.show_amount && (totalDisc > 0 || t.tax > 0 || t.service > 0);
                  const hasItems = p.show_items && t.items.length > 0;
                  const colSpanAll = extraCols + (p.show_amount ? 1 : 0);

                  return (
                    <>
                      <tr
                        key={t.id}
                        className={`border-b border-zinc-50 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}
                      >
                        <td className="px-4 py-3 text-xs text-zinc-500">{formatDateTime(t.date)}</td>
                        {p.show_invoice_number && (
                          <td className="px-4 py-3 text-xs text-zinc-500">
                            {t.receipt_code ?? "—"}
                          </td>
                        )}
                        {p.show_cashier && (
                          <td className="px-4 py-3 text-xs text-zinc-500">{t.cashier_name ?? "—"}</td>
                        )}
                        {p.show_customer && (
                          <td className="px-4 py-3 text-xs text-zinc-500">
                            {t.order_label ? (
                              <span className="font-medium text-zinc-700">{t.order_label}</span>
                            ) : null}
                            {t.order_label && (t.customer_name || t.free_customer_name) ? " · " : null}
                            {t.customer_name ?? t.free_customer_name ?? (!t.order_label ? "—" : null)}
                          </td>
                        )}
                        {p.show_payment_method && (
                          <td className="px-4 py-3 text-xs text-zinc-500">
                            {t.payment_methods.length > 0 ? t.payment_methods.join(" + ") : "—"}
                          </td>
                        )}
                        {p.show_amount && (
                          <td className="px-4 py-3 text-right text-xs font-semibold text-zinc-900">
                            {formatRupiah(t.total)}
                          </td>
                        )}
                      </tr>

                      {/* Breakdown diskon, PPN, service */}
                      {hasBreakdown && (
                        <tr
                          key={`${t.id}-breakdown`}
                          className={`border-b border-zinc-50 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}
                        >
                          <td colSpan={colSpanAll} className="px-4 pb-2 pt-0">
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 pl-2 text-[11px] text-zinc-400">
                              <span>Subtotal: {formatRupiah(t.subtotal_raw)}</span>
                              {totalDisc > 0 && (
                                <span className="text-red-500">
                                  Diskon: -{formatRupiah(totalDisc)}
                                </span>
                              )}
                              {t.service > 0 && (
                                <span>Layanan: +{formatRupiah(t.service)}</span>
                              )}
                              {t.tax > 0 && (
                                <span>PPN: +{formatRupiah(t.tax)}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Detail item */}
                      {hasItems && (
                        <tr
                          key={`${t.id}-items`}
                          className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}
                        >
                          <td colSpan={colSpanAll} className="px-4 pb-3 pt-0">
                            <div className="flex flex-wrap gap-1.5 pl-2">
                              {t.items.map((item, idx) => (
                                <span
                                  key={idx}
                                  className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600"
                                >
                                  {item.qty}× {item.product_name}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
              {p.show_amount && transactions.length > 1 && (
                <tfoot className="border-t border-zinc-200 bg-zinc-50">
                  <tr>
                    <td
                      colSpan={extraCols}
                      className="px-4 py-3 text-xs font-semibold text-zinc-500"
                    >
                      Total
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-zinc-900">
                      {formatRupiah(totalTx)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
