"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/billing/plans";

export type ActivateSubscriptionState = { error: string | null; resetToken: number };

export async function activateSubscriptionManually(
  businessId: string,
  prevState: ActivateSubscriptionState,
  formData: FormData,
): Promise<ActivateSubscriptionState> {
  const fail = (msg: string): ActivateSubscriptionState => ({
    error: msg,
    resetToken: prevState.resetToken,
  });

  const planCode = formData.get("planCode") as string;
  const note = (formData.get("note") as string)?.trim() || null;

  const plan = getPlan(planCode);
  if (!plan) {
    return fail("Paket tidak ditemukan.");
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc("admin_activate_subscription", {
    p_business_id: businessId,
    p_plan_code: plan.code,
    p_period_days: plan.periodDays,
    p_amount: plan.price,
    p_note: note,
  });

  if (error) {
    return fail(error.message);
  }

  revalidatePath("/admin");
  return { error: null, resetToken: prevState.resetToken + 1 };
}
