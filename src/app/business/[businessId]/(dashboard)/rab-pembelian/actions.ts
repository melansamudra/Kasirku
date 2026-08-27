"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type BudgetState = { error: string | null };

export async function setProcurementBudget(
  businessId: string,
  _prevState: BudgetState,
  formData: FormData,
): Promise<BudgetState> {
  const period = formData.get("period") as string;
  const amountRaw = formData.get("amount") as string;
  const amount = Number(amountRaw);

  if (!/^\d{4}-\d{2}$/.test(period ?? "")) {
    return { error: "Periode tidak valid." };
  }
  if (!amountRaw || Number.isNaN(amount) || amount < 0) {
    return { error: "RAB harus angka dan tidak boleh negatif." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("procurement_budgets").upsert(
    { business_id: businessId, period, amount, updated_at: new Date().toISOString() },
    { onConflict: "business_id,period" },
  );

  if (error) return { error: error.message };

  await logActivity(supabase, businessId, "sistem", "sukses", `RAB Pembelian ${period} diset: Rp${amount.toLocaleString("id-ID")}`);
  revalidatePath(`/business/${businessId}/rab-pembelian`);
  return { error: null };
}
