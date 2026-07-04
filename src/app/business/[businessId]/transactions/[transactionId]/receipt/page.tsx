import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "./print-button";

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ businessId: string; transactionId: string }>;
}) {
  const { businessId, transactionId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .single();

  const { data: transaction } = await supabase
    .from("transactions")
    .select(
      "id, invoice_number, date, subtotal_raw, subtotal, service, tax, total_item_disc, order_disc_amt, total, voided, cashiers!transactions_cashier_id_fkey(name)",
    )
    .eq("id", transactionId)
    .eq("business_id", businessId)
    .single();

  if (!business || !transaction) {
    notFound();
  }

  const { data: items } = await supabase
    .from("transaction_items")
    .select("id, name, price, qty")
    .eq("transaction_id", transactionId)
    .order("id", { ascending: true });

  const { data: payments } = await supabase
    .from("transaction_payments")
    .select("id, method, amount, received, change")
    .eq("transaction_id", transactionId);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 print:bg-white print:py-0">
      <div className="w-full max-w-xs font-mono text-xs text-zinc-900 print:max-w-none">
        <div className="print:hidden">
          <PrintButton businessId={businessId} transactionId={transactionId} />
        </div>

        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 print:mt-0 print:rounded-none print:border-0 print:p-0">
          <div className="text-center">
            <p className="text-sm font-bold uppercase">{business.name}</p>
            {transaction.voided && (
              <p className="mt-1 font-bold text-red-600">*** DIBATALKAN ***</p>
            )}
          </div>

          <div className="mt-3 border-t border-dashed border-zinc-300 pt-2">
            <div className="flex justify-between">
              <span>No.</span>
              <span>{transaction.invoice_number}</span>
            </div>
            <div className="flex justify-between">
              <span>Tanggal</span>
              <span>{formatDateTime(transaction.date)}</span>
            </div>
            <div className="flex justify-between">
              <span>Kasir</span>
              <span>
                {(transaction.cashiers as unknown as { name: string } | null)?.name ?? "—"}
              </span>
            </div>
          </div>

          <div className="mt-2 space-y-1 border-t border-dashed border-zinc-300 pt-2">
            {items?.map((item) => (
              <div key={item.id} className="flex justify-between gap-2">
                <span className="flex-1 truncate">
                  {item.name}
                  <span className="text-zinc-500">
                    {" "}
                    {item.qty}x{Number(item.price).toLocaleString("id-ID")}
                  </span>
                </span>
                <span className="shrink-0">
                  {formatRupiah(Number(item.price) * Number(item.qty))}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-2 space-y-1 border-t border-dashed border-zinc-300 pt-2">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatRupiah(Number(transaction.subtotal_raw))}</span>
            </div>
            {Number(transaction.total_item_disc) > 0 && (
              <div className="flex justify-between">
                <span>Diskon item</span>
                <span>-{formatRupiah(Number(transaction.total_item_disc))}</span>
              </div>
            )}
            {Number(transaction.order_disc_amt) > 0 && (
              <div className="flex justify-between">
                <span>Diskon order</span>
                <span>-{formatRupiah(Number(transaction.order_disc_amt))}</span>
              </div>
            )}
            {Number(transaction.service) > 0 && (
              <div className="flex justify-between">
                <span>Layanan</span>
                <span>{formatRupiah(Number(transaction.service))}</span>
              </div>
            )}
            {Number(transaction.tax) > 0 && (
              <div className="flex justify-between">
                <span>PPN</span>
                <span>{formatRupiah(Number(transaction.tax))}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-dashed border-zinc-300 pt-1 text-sm font-bold">
              <span>TOTAL</span>
              <span>{formatRupiah(Number(transaction.total))}</span>
            </div>
          </div>

          <div className="mt-2 space-y-1 border-t border-dashed border-zinc-300 pt-2">
            {payments?.map((p) => (
              <div key={p.id}>
                <div className="flex justify-between">
                  <span>{p.method}</span>
                  <span>{formatRupiah(Number(p.amount))}</span>
                </div>
                {p.received !== null && (
                  <div className="flex justify-between">
                    <span>Diterima</span>
                    <span>{formatRupiah(Number(p.received))}</span>
                  </div>
                )}
                {p.change !== null && Number(p.change) > 0 && (
                  <div className="flex justify-between">
                    <span>Kembalian</span>
                    <span>{formatRupiah(Number(p.change))}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="mt-4 border-t border-dashed border-zinc-300 pt-2 text-center">
            Terima kasih!
          </p>
        </div>
      </div>
    </div>
  );
}
