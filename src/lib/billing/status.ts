import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type SubscriptionAccess = {
  locked: boolean;
  status: "unpaid" | "active" | "past_due" | "expired";
  planCode: string | null;
  periodEnd: string | null;
};

// `unpaid` (no subscription row yet, or never paid) and `expired` (lapsed
// past the grace period) block access; `active` and `past_due` don't —
// past_due only shows a warning banner, per the grace-period design.
export async function getSubscriptionAccess(
  supabase: SupabaseServerClient,
  businessId: string,
): Promise<SubscriptionAccess> {
  const { data } = await supabase
    .from("subscriptions")
    .select("plan_code, status, period_end")
    .eq("business_id", businessId)
    .maybeSingle();

  if (!data) {
    return { locked: true, status: "unpaid", planCode: null, periodEnd: null };
  }

  const status = data.status as SubscriptionAccess["status"];
  return {
    locked: status === "unpaid" || status === "expired",
    status,
    planCode: data.plan_code,
    periodEnd: data.period_end,
  };
}
