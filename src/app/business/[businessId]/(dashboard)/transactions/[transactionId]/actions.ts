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

  // Resolve cashier id for audit trail (optional)
  const session = await getCashierSession(businessId);
  const cashierQuery = session
    ? await supabase.from("cashiers").select("id").eq("business_id", businessId).eq("name", session.name).maybeSingle()
    : null;
  const cashierId = cashierQuery?.data?.id ?? null;

  const { error } = await supabase.rpc("void_transaction_item", {
    p_business_id:    businessId,
    p_transaction_id: transactionId,
    p_item_id:        itemId,
    p_reason:         reason || null,
    ...(cashierId ? { p_cashier_id: cashierId } : {}),
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("item sudah di-void")) return { success: false, error: "Item sudah di-void." };
    if (msg.includes("item tidak ditemukan")) return { success: false, error: "Item tidak ditemukan." };
    return { success: false, error: msg || "Gagal membatalkan item." };
  }

  await logActivity(
    supabase,
    businessId,
    "transaksi",
    "warning",
    `Void item: ${itemName} (${invoiceNumber})`,
    `Alasan: ${reason || "—"}`,
  );
  revalidatePath(`/business/${businessId}/transactions/${transactionId}`);
  revalidatePath(`/business/${businessId}/transactions`);
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
