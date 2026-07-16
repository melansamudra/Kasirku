import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VoidTransactionForm from "./void-transaction-form";

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; transactionId: string }>;
}) {
  const { businessId, transactionId } = await params;
  const supabase = await createClient();

  const { data: transaction } = await supabase
    .from("transactions")
    .select(
      "id, invoice_number, date, subtotal_raw, subtotal, service, tax, total_item_disc, order_disc_amt, total, total_cost, gross_profit, voided, voided_at, void_reason, cashiers!transactions_cashier_id_fkey(name), voided_by_cashier:cashiers!transactions_voided_by_fkey(name)",
    )
    .eq("id", transactionId)
    .eq("business_id", businessId)
    .single();

  if (!transaction) {
    notFound();
  }

  const { data: items } = await supabase
    .from("transaction_items")
    .select("id, name, category, price, qty")
    .eq("transaction_id", transactionId)
    .order("id", { ascending: true });

  const { data: payments } = await supabase
    .from("transaction_payments")
    .select("id, method, amount, received, change")
    .eq("transaction_id", transactionId);

  return (
    <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-zinc-900">{transaction.invoice_number}</h1>
          {transaction.voided && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
              Dibatalkan
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-sm text-zinc-500">{formatDateTime(transaction.date)}</p>
          <Link
            href={`/business/${businessId}/transactions/${transactionId}/receipt`}
            target="_blank"
            className="text-xs font-medium text-brand-600 hover:underline"
          >
            🖨️ Cetak Struk
          </Link>
        </div>
        <p className="text-xs text-zinc-400">
          Kasir: {(transaction.cashiers as unknown as { name: string } | null)?.name ?? "—"}
        </p>

        <div className="mt-6 rounded-xl bg-white shadow-sm p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Item</h2>
          <div className="space-y-2">
            {items?.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="text-zinc-900">{item.name}</p>
                  <p className="text-xs text-zinc-500">
                    {item.qty} × {formatRupiah(Number(item.price))}
                  </p>
                </div>
                <p className="font-medium text-zinc-900">
                  {formatRupiah(Number(item.price) * Number(item.qty))}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-1 border-t border-zinc-100 pt-3 text-sm">
            <div className="flex justify-between text-zinc-600">
              <span>Subtotal</span>
              <span>{formatRupiah(Number(transaction.subtotal_raw))}</span>
            </div>
            {Number(transaction.total_item_disc) > 0 && (
              <div className="flex justify-between text-brand-700">
                <span>Diskon item</span>
                <span>− {formatRupiah(Number(transaction.total_item_disc))}</span>
              </div>
            )}
            {Number(transaction.order_disc_amt) > 0 && (
              <div className="flex justify-between text-brand-700">
                <span>Diskon order</span>
                <span>− {formatRupiah(Number(transaction.order_disc_amt))}</span>
              </div>
            )}
            {Number(transaction.service) > 0 && (
              <div className="flex justify-between text-zinc-600">
                <span>Layanan</span>
                <span>{formatRupiah(Number(transaction.service))}</span>
              </div>
            )}
            {Number(transaction.tax) > 0 && (
              <div className="flex justify-between text-zinc-600">
                <span>PPN</span>
                <span>{formatRupiah(Number(transaction.tax))}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-zinc-900">
              <span>Total</span>
              <span>{formatRupiah(Number(transaction.total))}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-white shadow-sm p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Pembayaran</h2>
          {payments?.map((p) => (
            <div key={p.id} className="space-y-1 text-sm">
              <div className="flex justify-between text-zinc-600">
                <span>Metode</span>
                <span className="font-medium text-zinc-900">{p.method}</span>
              </div>
              {p.received !== null && (
                <div className="flex justify-between text-zinc-600">
                  <span>Diterima</span>
                  <span>{formatRupiah(Number(p.received))}</span>
                </div>
              )}
              {p.change !== null && Number(p.change) > 0 && (
                <div className="flex justify-between text-zinc-600">
                  <span>Kembalian</span>
                  <span className="font-bold text-zinc-900">{formatRupiah(Number(p.change))}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {transaction.voided ? (
          <div className="mt-4 rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm font-bold text-red-600">✕ TRANSAKSI DIBATALKAN</p>
            <p className="mt-1 text-xs text-red-500">
              Oleh:{" "}
              {(transaction.voided_by_cashier as unknown as { name: string } | null)?.name ??
                "—"}
              {transaction.voided_at && ` · ${formatDateTime(transaction.voided_at)}`}
            </p>
            {transaction.void_reason && (
              <p className="mt-0.5 text-xs text-red-500">Alasan: {transaction.void_reason}</p>
            )}
          </div>
        ) : (
          <VoidTransactionForm
            businessId={businessId}
            transactionId={transaction.id}
            invoiceNumber={transaction.invoice_number}
          />
        )}
    </div>
  );
}
