"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type VoidResult = { success: true } | { success: false; error: string };

export async function ownerVoidTransaction(
  businessId: string,
  transactionId: string,
  invoiceNumber: string,
  reason: string,
): Promise<VoidResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("owner_void_transaction", {
    p_business_id: businessId,
    p_transaction_id: transactionId,
    p_reason: reason,
  });

  if (error) {
    return { success: false, error: error.message ?? "Gagal membatalkan transaksi." };
  }

  await logActivity(
    supabase,
    businessId,
    "transaksi",
    "warning",
    `Void transaksi ${invoiceNumber}`,
    `Oleh: Owner · Alasan: ${reason}`,
  );
  revalidatePath(`/business/${businessId}/transactions/${transactionId}`);
  revalidatePath(`/business/${businessId}/transactions`);
  return { success: true };
}
