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

export default async function TicketReceiptPage({
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
    .from("ticket_transactions")
    .select(
      "id, invoice_number, date, subtotal, service, tax, total, payment_method, received, change, voided, cashiers!ticket_transactions_cashier_id_fkey(name), members(name, member_code)",
    )
    .eq("id", transactionId)
    .eq("business_id", businessId)
    .single();

  if (!business || !transaction) {
    notFound();
  }

  const { data: serials } = await supabase
    .from("ticket_serials")
    .select("id, serial_no, price, ticket_categories(name)")
    .eq("ticket_transaction_id", transactionId)
    .order("serial_no", { ascending: true });

  const cashier = transaction.cashiers as unknown as { name: string } | null;
  const member = transaction.members as unknown as { name: string; member_code: string } | null;

  return (
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
            <span>{cashier?.name ?? "—"}</span>
          </div>
          {member && (
            <div className="flex justify-between">
              <span>Member</span>
              <span>{member.name}</span>
            </div>
          )}
        </div>

        <div className="mt-2 space-y-1 border-t border-dashed border-zinc-300 pt-2">
          {serials?.map((s) => (
            <div key={s.id} className="flex justify-between gap-2">
              <span className="flex-1 truncate">
                #{s.serial_no}{" "}
                {(s.ticket_categories as unknown as { name: string } | null)?.name ?? "Lainnya"}
              </span>
              <span className="shrink-0">{formatRupiah(Number(s.price))}</span>
            </div>
          ))}
        </div>

        <div className="mt-2 space-y-1 border-t border-dashed border-zinc-300 pt-2">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatRupiah(Number(transaction.subtotal))}</span>
          </div>
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
          <div className="flex justify-between">
            <span>{transaction.payment_method}</span>
            <span>{formatRupiah(Number(transaction.total))}</span>
          </div>
          {transaction.received !== null && (
            <div className="flex justify-between">
              <span>Diterima</span>
              <span>{formatRupiah(Number(transaction.received))}</span>
            </div>
          )}
          {Number(transaction.change) > 0 && (
            <div className="flex justify-between">
              <span>Kembalian</span>
              <span>{formatRupiah(Number(transaction.change))}</span>
            </div>
          )}
        </div>

        <p className="mt-4 border-t border-dashed border-zinc-300 pt-2 text-center">
          Simpan tiket ini sebagai bukti masuk. Terima kasih!
        </p>
      </div>
    </div>
  );
}
