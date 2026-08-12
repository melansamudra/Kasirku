"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getPlan } from "@/lib/billing/plans";

export async function toggleMirroring(businessId: string, enabled: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const service = createServiceClient();
  const { data: adminRow } = await service
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) return;

  await service
    .from("businesses")
    .update({ mirroring_enabled: enabled })
    .eq("id", businessId);
  revalidatePath("/admin");
}

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

  // Verify session and admin status at the application layer.
  // We cannot rely on auth.uid() inside security-definer functions when
  // called from a server action — the JWT context is not forwarded to the
  // postgres function in all Supabase hosting configurations.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Sesi tidak valid, silakan login ulang.");

  const service = createServiceClient();

  const { data: adminRow } = await service
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) return fail("Akun ini bukan admin.");

  const planCode = formData.get("planCode") as string;
  const note = (formData.get("note") as string)?.trim() || null;

  const plan = getPlan(planCode);
  if (!plan) return fail("Paket tidak ditemukan.");

  // Read current period_end so we can extend from the greater of now() vs
  // the existing end — same logic as the stored procedure.
  const { data: sub } = await service
    .from("subscriptions")
    .select("period_end")
    .eq("business_id", businessId)
    .maybeSingle();

  let newPeriodEnd: string | null = null;
  if (plan.periodDays !== null) {
    const now = new Date();
    const current = sub?.period_end ? new Date(sub.period_end) : now;
    const base = current > now ? current : now;
    base.setDate(base.getDate() + plan.periodDays);
    newPeriodEnd = base.toISOString();
  }

  const orderId =
    "MANUAL-" +
    businessId.replace(/-/g, "") +
    "-" +
    Math.floor(Date.now() / 1000).toString();

  const { error: payErr } = await service.from("payments").insert({
    business_id: businessId,
    plan_code: plan.code,
    order_id: orderId,
    amount: plan.price,
    status: "settlement",
    payment_type: "manual",
    raw_notification: { note, activated_by: "admin", activated_by_uid: user.id },
  });
  if (payErr) return fail(payErr.message);

  const { error: subErr } = await service.from("subscriptions").upsert(
    {
      business_id: businessId,
      plan_code: plan.code,
      status: "active",
      period_end: newPeriodEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id" },
  );
  if (subErr) return fail(subErr.message);

  revalidatePath("/admin");
  return { error: null, resetToken: prevState.resetToken + 1 };
}
