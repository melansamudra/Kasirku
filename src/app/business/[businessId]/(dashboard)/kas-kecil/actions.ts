"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type ActionState = { error: string | null };

export async function reviewCashMovement(
  businessId: string,
  movementId: string,
  decision: "approve" | "reject",
  accountCode?: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_shift_cash_movement", {
    p_movement_id: movementId,
    p_decision: decision,
    p_account_code: accountCode || null,
  });

  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "sistem",
    decision === "approve" ? "sukses" : "warning",
    decision === "approve" ? "Kas kecil disetujui" : "Kas kecil ditolak",
    decision === "approve" && accountCode ? `Akun: ${accountCode}` : undefined,
  );

  revalidatePath(`/business/${businessId}/kas-kecil`);
  revalidatePath(`/business/${businessId}/kas-harian`);
  revalidatePath(`/business/${businessId}/accounting/jurnal`);
  return { error: null };
}

export async function addPettyCashExpense(
  businessId: string,
  amount: number,
  description: string,
  category: string,
  receiptUrl?: string | null,
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("post_petty_cash_expense", {
    p_business_id: businessId,
    p_amount: amount,
    p_description: description,
    p_category: category || null,
    p_receipt_url: receiptUrl || null,
  });

  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "info",
    `Kas Kecil (admin): ${description}`,
    `Rp${amount.toLocaleString("id-ID")}${category ? ` · ${category}` : ""}`,
  );

  revalidatePath(`/business/${businessId}/kas-kecil`);
  revalidatePath(`/business/${businessId}/kas-harian`);
  return { error: null };
}
