"use server";

import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type ManualTransactionItemInput = { productId: string; qty: number };

export type CreateManualTransactionResult =
  | { success: true; transactionId: string; invoiceNumber: string }
  | { success: false; error: string };

export async function createManualTransaction(
  businessId: string,
  date: string,
  items: ManualTransactionItemInput[],
  paymentMethod: string,
  received: number | null,
  customerId: string | null,
): Promise<CreateManualTransactionResult> {
  if (items.length === 0) {
    return { success: false, error: "Keranjang masih kosong." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_manual_transaction", {
      p_business_id: businessId,
      p_date: date,
      p_items: items.map((i) => ({ product_id: i.productId, qty: i.qty })),
      p_payment_method: paymentMethod,
      p_received: received,
      p_customer_id: customerId,
    })
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Gagal menyimpan transaksi." };
  }

  const result = data as { transaction_id: string; invoice_number: string };

  const itemCount = items.reduce((sum, i) => sum + i.qty, 0);
  await logActivity(
    supabase,
    businessId,
    "transaksi",
    "info",
    `Transaksi manual ${result.invoice_number}`,
    `${itemCount} item · ${paymentMethod}`,
  );

  return {
    success: true,
    transactionId: result.transaction_id,
    invoiceNumber: result.invoice_number,
  };
}
