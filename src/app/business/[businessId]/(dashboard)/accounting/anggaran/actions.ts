"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type BudgetState = { error: string | null };

export async function setBudget(
  businessId: string,
  _prevState: BudgetState,
  formData: FormData,
): Promise<BudgetState> {
  const accountId = formData.get("accountId") as string;
  const period = formData.get("period") as string;
  const amountRaw = formData.get("amount") as string;
  const amount = Number(amountRaw);

  if (!accountId) {
    return { error: "Pilih akun dulu." };
  }
  if (!/^\d{4}-\d{2}$/.test(period ?? "")) {
    return { error: "Periode tidak valid." };
  }
  if (!amountRaw || Number.isNaN(amount) || amount < 0) {
    return { error: "Target harus angka dan tidak boleh negatif." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("budgets").upsert(
    { business_id: businessId, account_id: accountId, period, target_amount: amount },
    { onConflict: "business_id,account_id,period" },
  );

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/accounting/anggaran`);
  return { error: null };
}

export async function deleteBudget(businessId: string, budgetId: string) {
  const supabase = await createClient();
  await supabase.from("budgets").delete().eq("id", budgetId).eq("business_id", businessId);
  revalidatePath(`/business/${businessId}/accounting/anggaran`);
}
