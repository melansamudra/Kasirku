import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VoidTicketTransactionForm from "./void-ticket-transaction-form";

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

export default async function TicketTransactionDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; transactionId: string }>;
}) {
  const { businessId, transactionId } = await params;
  const supabase = await createClient();

  const { data: transaction } = await supabase
    .from("ticket_transactions")
    .select(
      "id, invoice_number, date, subtotal, service, tax, total, payment_method, received, change, is_holiday, voided, voided_at, void_reason, cashiers!ticket_transactions_cashier_id_fkey(name), voided_by_cashier:cashiers!ticket_transactions_voided_by_fkey(name), members(name, member_code)",
    )
    .eq("id", transactionId)
    .eq("business_id", businessId)
    .single();

  if (!transaction) {
    notFound();
  }

  const { data: serials } = await supabase
    .from("ticket_serials")
    .select("id, serial_no, manual_number, price, is_member_price, ticket_categories(name)")
    .eq("ticket_transaction_id", transactionId)
    .order("serial_no", { ascending: true });

  const cashier = transaction.cashiers as unknown as { name: string } | null;
  const voidedByCashier = transaction.voided_by_cashier as unknown as { name: string } | null;
  const member = transaction.members as unknown as { name: string; member_code: string } | null;

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
          href={`/business/${businessId}/ticket-reports/${transactionId}/receipt`}
          target="_blank"
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          🖨️ Cetak Struk
        </Link>
      </div>
      <p className="text-xs text-zinc-400">
        Kasir: {cashier?.name ?? "—"}
        {member && ` · Member: ${member.name} (${member.member_code})`}
        {" · "}
        {transaction.is_holiday ? "🌴 Hari Libur" : "📅 Hari Kerja"}
      </p>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-4">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Tiket</h2>
        <div className="space-y-2">
          {serials?.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <div>
                <p className="text-zinc-900">
                  #{s.serial_no} (fisik #{s.manual_number}) —{" "}
                  {(s.ticket_categories as unknown as { name: string } | null)?.name ?? "Lainnya"}
                  {s.is_member_price && (
                    <span className="ml-1.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                      Member
                    </span>
                  )}
                </p>
              </div>
              <p className="font-medium text-zinc-900">{formatRupiah(Number(s.price))}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-1 border-t border-zinc-100 pt-3 text-sm">
          <div className="flex justify-between text-zinc-600">
            <span>Subtotal</span>
            <span>{formatRupiah(Number(transaction.subtotal))}</span>
          </div>
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
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-zinc-600">
            <span>Metode</span>
            <span className="font-medium text-zinc-900">{transaction.payment_method}</span>
          </div>
          {transaction.received !== null && (
            <div className="flex justify-between text-zinc-600">
              <span>Diterima</span>
              <span>{formatRupiah(Number(transaction.received))}</span>
            </div>
          )}
          {Number(transaction.change) > 0 && (
            <div className="flex justify-between text-zinc-600">
              <span>Kembalian</span>
              <span>{formatRupiah(Number(transaction.change))}</span>
            </div>
          )}
        </div>
      </div>

      {transaction.voided ? (
        <div className="mt-4 rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-center">
          <p className="text-sm font-bold text-red-600">✕ TIKET DIBATALKAN</p>
          <p className="mt-1 text-xs text-red-500">
            Oleh: {voidedByCashier?.name ?? "—"}
            {transaction.voided_at && ` · ${formatDateTime(transaction.voided_at)}`}
          </p>
          {transaction.void_reason && (
            <p className="mt-0.5 text-xs text-red-500">Alasan: {transaction.void_reason}</p>
          )}
        </div>
      ) : (
        <VoidTicketTransactionForm businessId={businessId} transactionId={transaction.id} />
      )}
    </div>
  );
}
