"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { getCashierSession } from "@/lib/cashier-session";

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

export async function voidTransactionItem(
  businessId: string,
  transactionId: string,
  itemId: string,
  itemName: string,
  invoiceNumber: string,
  reason: string,
): Promise<VoidResult> {
  const supabase = await createClient();

  // Verify item belongs to this business's transaction
  const { data: item } = await supabase
    .from("transaction_items")
    .select("id, voided")
    .eq("id", itemId)
    .eq("transaction_id", transactionId)
    .single();

  if (!item) return { success: false, error: "Item tidak ditemukan." };
  if (item.voided) return { success: false, error: "Item sudah di-void." };

  // Try to get cashier session for audit trail
  const session = await getCashierSession(businessId);
  const cashierQuery = session
    ? await supabase.from("cashiers").select("id").eq("business_id", businessId).eq("name", session.name).maybeSingle()
    : null;
  const cashierId = cashierQuery?.data?.id ?? null;

  const { error } = await supabase
    .from("transaction_items")
    .update({
      voided: true,
      void_reason: reason || null,
      voided_at: new Date().toISOString(),
      ...(cashierId ? { voided_by: cashierId } : {}),
    })
    .eq("id", itemId);

  if (error) return { success: false, error: error.message };

  await logActivity(
    supabase,
    businessId,
    "transaksi",
    "warning",
    `Void item: ${itemName} (${invoiceNumber})`,
    `Alasan: ${reason || "—"}`,
  );
  revalidatePath(`/business/${businessId}/transactions/${transactionId}`);
  return { success: true };
}

// For staff accounts (business_staff) — owns_business() treats staff and the
// real owner the same for RLS/RPC access, so without this a staff member
// with just "transactions" view permission could void exactly like the
// owner, with zero extra confirmation. void_transaction (unlike
// owner_void_transaction) requires an active manager-role cashier PIN,
// mirroring void_ticket_transaction's existing pattern — no new schema.
export async function staffVoidTransaction(
  businessId: string,
  transactionId: string,
  invoiceNumber: string,
  managerPin: string,
  reason: string,
): Promise<VoidResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_transaction", {
    p_business_id: businessId,
    p_transaction_id: transactionId,
    p_manager_pin: managerPin,
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
    `Alasan: ${reason}`,
  );
  revalidatePath(`/business/${businessId}/transactions/${transactionId}`);
  revalidatePath(`/business/${businessId}/transactions`);
  return { success: true };
}
