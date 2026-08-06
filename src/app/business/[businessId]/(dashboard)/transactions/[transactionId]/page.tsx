import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VoidTransactionForm from "./void-transaction-form";
import ReprintKitchenButton from "./reprint-kitchen-button";
import VoidItemButton from "./void-item-button";

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

  const [{ data: business }, { data: userData }] = await Promise.all([
    supabase.from("businesses").select("owner_id").eq("id", businessId).single(),
    supabase.auth.getUser(),
  ]);
  const isOwner = business?.owner_id === userData.user?.id;

  const { data: transaction } = await supabase
    .from("transactions")
    .select(
      "id, invoice_number, date, subtotal_raw, subtotal, service, tax, total_item_disc, order_disc_amt, total, total_cost, gross_profit, voided, voided_at, void_reason, order_label, customer_name, cashiers!transactions_cashier_id_fkey(name), voided_by_cashier:cashiers!transactions_voided_by_fkey(name)",
    )
    .eq("id", transactionId)
    .eq("business_id", businessId)
    .single();

  if (!transaction) {
    notFound();
  }

  const { data: items } = await supabase
    .from("transaction_items")
    .select("id, name, category, price, qty, voided, void_reason, voided_at")
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
          {(transaction as unknown as { order_label?: string | null }).order_label && (
            <> · {(transaction as unknown as { order_label: string }).order_label}</>
          )}
          {(transaction as unknown as { customer_name?: string | null }).customer_name && (
            <> · {(transaction as unknown as { customer_name: string }).customer_name}</>
          )}
        </p>

        <div className="mt-6 rounded-xl bg-white shadow-sm p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Item</h2>
          <div className="space-y-2">
            {items?.map((item) => {
              const isVoided = (item as unknown as { voided?: boolean }).voided;
              const voidReason = (item as unknown as { void_reason?: string | null }).void_reason;
              const voidedAt = (item as unknown as { voided_at?: string | null }).voided_at;
              return (
                <div key={item.id}>
                  <div className={`flex items-start justify-between text-sm ${isVoided ? "opacity-50" : ""}`}>
                    <div className="flex-1">
                      <p className={`text-zinc-900 ${isVoided ? "line-through" : ""}`}>{item.name}</p>
                      <p className="text-xs text-zinc-500">
                        {item.qty} × {formatRupiah(Number(item.price))}
                      </p>
                      {isVoided && (
                        <p className="text-[11px] text-red-500">
                          Void{voidReason ? ` · ${voidReason}` : ""}
                          {voidedAt ? ` · ${new Date(voidedAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <p className={`font-medium text-zinc-900 ${isVoided ? "line-through" : ""}`}>
                        {formatRupiah(Number(item.price) * Number(item.qty))}
                      </p>
                      {!transaction.voided && !isVoided && (
                        <VoidItemButton
                          businessId={businessId}
                          transactionId={transactionId}
                          itemId={item.id}
                          itemName={item.name}
                          invoiceNumber={transaction.invoice_number}
                        />
                      )}
                    </div>
                  </div>
                  {/* Confirm panel muncul di bawah item (dirender dari client) */}
                </div>
              );
            })}
          </div>

          {/* Total refund dari item yang di-void */}
          {(() => {
            const voidedTotal = (items ?? []).reduce((sum, item) => {
              const isVoided = (item as unknown as { voided?: boolean }).voided;
              return isVoided ? sum + Number(item.price) * Number(item.qty) : sum;
            }, 0);
            if (voidedTotal === 0) return null;
            return (
              <div className="mt-3 rounded-lg bg-red-50 px-3 py-2.5 border border-red-100">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-red-700">Kembalikan ke pelanggan</span>
                  <span className="font-bold text-red-700">− {formatRupiah(voidedTotal)}</span>
                </div>
                <p className="mt-0.5 text-xs text-red-500">
                  Dari {(items ?? []).filter((i) => (i as unknown as { voided?: boolean }).voided).length} item yang di-void
                </p>
              </div>
            );
          })()}

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

        {!transaction.voided && (
          <ReprintKitchenButton businessId={businessId} transactionId={transaction.id} />
        )}

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
            isOwner={isOwner}
          />
        )}
    </div>
  );
}
