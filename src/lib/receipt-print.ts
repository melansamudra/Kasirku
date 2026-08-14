import type { SupabaseClient } from "@supabase/supabase-js";
import { buildReceiptTicket } from "./escpos";

export type BuildReceiptBufferResult =
  | { success: true; buffer: Buffer }
  | { success: false; error: string };

// Shared by the automatic "print receipt on checkout" path (checkout()) and
// the manual "Cetak ke <printer>" button on the receipt page — both just
// need the priced ticket bytes for a transaction, independent of which
// printer it ends up going to.
export async function buildReceiptBuffer(
  supabase: SupabaseClient,
  businessId: string,
  transactionId: string,
  paperWidth = 58,
): Promise<BuildReceiptBufferResult> {
  const [{ data: business }, { data: transaction }, { data: items }, { data: payments }] =
    await Promise.all([
      supabase.from("businesses").select("name, address, phone, receipt_settings").eq("id", businessId).single(),
      supabase
        .from("transactions")
        .select(
          "invoice_number, receipt_code, date, subtotal_raw, service, tax, total_item_disc, order_disc_amt, order_disc_name, total, voided, cashiers!transactions_cashier_id_fkey(name)",
        )
        .eq("id", transactionId)
        .eq("business_id", businessId)
        .single(),
      supabase
        .from("transaction_items")
        .select("id, name, price, qty, note, voided, batch")
        .eq("transaction_id", transactionId)
        .order("batch", { ascending: true })
        .order("id", { ascending: true }),
      supabase
        .from("transaction_payments")
        .select("method, amount, received, change")
        .eq("transaction_id", transactionId),
    ]);

  if (!business || !transaction) {
    return { success: false, error: "Transaksi tidak ditemukan." };
  }

  const buffer = buildReceiptTicket({
    businessName: business.name,
    businessAddress: (business as unknown as { address?: string | null }).address,
    businessPhone: (business as unknown as { phone?: string | null }).phone,
    invoiceNumber: transaction.invoice_number,
    receiptCode: (transaction as unknown as { receipt_code?: string | null }).receipt_code,
    date: new Date(transaction.date).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }),
    cashierName: (transaction.cashiers as unknown as { name: string } | null)?.name ?? "—",
    voided: transaction.voided,
    items: (items ?? []).map((i) => ({ name: i.name, qty: Number(i.qty), price: Number(i.price), note: (i as unknown as { note?: string | null }).note, voided: (i as unknown as { voided?: boolean }).voided, batch: (i as unknown as { batch?: number }).batch ?? 0 })),
    subtotal: Number(transaction.subtotal_raw),
    itemDiscount: Number(transaction.total_item_disc),
    orderDiscount: Number(transaction.order_disc_amt),
    orderDiscountName: (transaction as unknown as { order_disc_name?: string | null }).order_disc_name ?? null,
    service: Number(transaction.service),
    tax: Number(transaction.tax),
    total: Number(transaction.total),
    payments: (payments ?? []).map((p) => ({
      method: p.method,
      amount: Number(p.amount),
      received: p.received === null ? null : Number(p.received),
      change: p.change === null ? null : Number(p.change),
    })),
    settings: (business as unknown as { receipt_settings?: object }).receipt_settings as import("./escpos").ReceiptSettings | undefined,
    paperWidth,
  });

  return { success: true, buffer };
}
