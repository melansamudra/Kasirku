"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type VoidResult = { success: true } | { success: false; error: string };

export async function voidTransaction(
  businessId: string,
  transactionId: string,
  invoiceNumber: string,
  managerPin: string,
  reason: string,
): Promise<VoidResult> {
  if (!/^[0-9]{4,6}$/.test(managerPin)) {
    return { success: false, error: "PIN harus 4-6 digit angka." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("void_transaction", {
      p_business_id: businessId,
      p_transaction_id: transactionId,
      p_manager_pin: managerPin,
      p_reason: reason,
    })
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Gagal membatalkan transaksi." };
  }

  const managerName = (data as { voided_by_name: string }).voided_by_name;
  await logActivity(
    supabase,
    businessId,
    "transaksi",
    "warning",
    `Void transaksi ${invoiceNumber}`,
    `Oleh: ${managerName} · Alasan: ${reason}`,
  );
  revalidatePath(`/business/${businessId}/transactions/${transactionId}`);
  revalidatePath(`/business/${businessId}/transactions`);
  return { success: true };
}
