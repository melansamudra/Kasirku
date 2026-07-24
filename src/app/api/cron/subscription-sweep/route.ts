import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const GRACE_PERIOD_DAYS = 3;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const now = new Date();
  const graceCutoff = new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const { data: pastDue, error: pastDueError } = await supabase
    .from("subscriptions")
    .update({ status: "past_due", updated_at: now.toISOString() })
    .eq("status", "active")
    .lt("period_end", now.toISOString())
    .select("id");

  const { data: expired, error: expiredError } = await supabase
    .from("subscriptions")
    .update({ status: "expired", updated_at: now.toISOString() })
    .eq("status", "past_due")
    .lt("period_end", graceCutoff.toISOString())
    .select("id");

  // Trials get no grace period — they lapse straight to unpaid, unlike a
  // paying customer who gets past_due first.
  const { data: trialExpired, error: trialExpiredError } = await supabase
    .from("subscriptions")
    .update({ status: "unpaid", updated_at: now.toISOString() })
    .eq("status", "trialing")
    .lt("period_end", now.toISOString())
    .select("id");

  if (pastDueError || expiredError || trialExpiredError) {
    return NextResponse.json(
      { error: pastDueError?.message ?? expiredError?.message ?? trialExpiredError?.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    pastDueCount: pastDue?.length ?? 0,
    expiredCount: expired?.length ?? 0,
    trialExpiredCount: trialExpired?.length ?? 0,
  });
}
