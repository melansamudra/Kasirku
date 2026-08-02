import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getPlan } from "@/lib/billing/plans";

type XenditInvoiceCallback = {
  id: string;
  external_id: string;
  status: string;
  payment_method?: string;
  payment_channel?: string;
  paid_amount?: number;
};

async function handleDesktopOrderCallback(
  supabase: ReturnType<typeof createServiceClient>,
  body: XenditInvoiceCallback,
) {
  const { data: order } = await supabase
    .from("hpp_desktop_orders")
    .select("id, status")
    .eq("order_id", body.external_id)
    .maybeSingle();

  if (!order) {
    console.error(`Xendit callback for unknown hpp_desktop_orders order_id: ${body.external_id}`);
    return NextResponse.json({ ok: true });
  }

  if (order.status === "settlement") {
    return NextResponse.json({ ok: true });
  }

  const newStatus = body.status === "PAID" ? "settlement" : body.status === "EXPIRED" ? "expire" : "pending";

  await supabase
    .from("hpp_desktop_orders")
    .update({
      status: newStatus,
      midtrans_transaction_id: body.id,
      payment_type: body.payment_method ?? body.payment_channel ?? null,
      raw_notification: body,
      ...(newStatus === "settlement" ? { download_token: randomUUID() } : {}),
    })
    .eq("id", order.id);

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const callbackToken = request.headers.get("x-callback-token");
  if (!callbackToken || callbackToken !== process.env.XENDIT_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  const body = (await request.json()) as XenditInvoiceCallback;

  const supabase = createServiceClient();

  if (body.external_id.startsWith("HPP-")) {
    return handleDesktopOrderCallback(supabase, body);
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("id, business_id, plan_code, status")
    .eq("order_id", body.external_id)
    .maybeSingle();

  if (!payment) {
    console.error(`Xendit callback for unknown order_id: ${body.external_id}`);
    return NextResponse.json({ ok: true });
  }

  if (payment.status === "settlement") {
    return NextResponse.json({ ok: true });
  }

  const newPaymentStatus =
    body.status === "PAID" ? "settlement" : body.status === "EXPIRED" ? "expire" : "pending";

  await supabase
    .from("payments")
    .update({
      status: newPaymentStatus,
      midtrans_transaction_id: body.id,
      payment_type: body.payment_method ?? body.payment_channel ?? null,
      raw_notification: body,
    })
    .eq("id", payment.id);

  if (newPaymentStatus !== "settlement") {
    return NextResponse.json({ ok: true });
  }

  const plan = getPlan(payment.plan_code);
  if (!plan) {
    console.error(`Settled payment references unknown plan_code: ${payment.plan_code}`);
    return NextResponse.json({ ok: true });
  }

  let newPeriodEnd: string | null = null;
  if (plan.periodDays !== null) {
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("period_end")
      .eq("business_id", payment.business_id)
      .maybeSingle();

    const now = Date.now();
    const currentPeriodEnd = subscription?.period_end
      ? new Date(subscription.period_end).getTime()
      : 0;
    const base = Math.max(now, currentPeriodEnd);
    newPeriodEnd = new Date(base + plan.periodDays * 24 * 60 * 60 * 1000).toISOString();
  }

  await supabase
    .from("subscriptions")
    .update({
      plan_code: plan.code,
      status: "active",
      period_end: newPeriodEnd,
      updated_at: new Date().toISOString(),
    })
    .eq("business_id", payment.business_id);

  return NextResponse.json({ ok: true });
}
