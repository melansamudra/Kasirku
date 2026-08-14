import { randomUUID, timingSafeEqual } from "crypto";
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

function tokensMatch(expected: string, actual: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handleDesktopOrderCallback(
  supabase: ReturnType<typeof createServiceClient>,
  body: XenditInvoiceCallback,
) {
  const { data: order, error: orderError } = await supabase
    .from("hpp_desktop_orders")
    .select("id, status")
    .eq("order_id", body.external_id)
    .maybeSingle();

  if (orderError) {
    console.error(`Xendit: gagal query hpp_desktop_orders untuk ${body.external_id}:`, orderError);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  if (!order) {
    console.error(`Xendit callback for unknown hpp_desktop_orders order_id: ${body.external_id}`);
    return NextResponse.json({ ok: true });
  }

  if (order.status === "settlement") {
    return NextResponse.json({ ok: true });
  }

  const newStatus = body.status === "PAID" ? "settlement" : body.status === "EXPIRED" ? "expire" : "pending";

  const { error: updateError } = await supabase
    .from("hpp_desktop_orders")
    .update({
      status: newStatus,
      midtrans_transaction_id: body.id,
      payment_type: body.payment_method ?? body.payment_channel ?? null,
      raw_notification: body,
      ...(newStatus === "settlement" ? { download_token: randomUUID() } : {}),
    })
    .eq("id", order.id);

  if (updateError) {
    console.error(`Xendit: gagal update hpp_desktop_orders ${order.id}:`, updateError);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const callbackToken = request.headers.get("x-callback-token");
  const expectedToken = process.env.XENDIT_WEBHOOK_TOKEN;
  if (!expectedToken) {
    console.error("Xendit: XENDIT_WEBHOOK_TOKEN tidak diset");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }
  if (!callbackToken || !tokensMatch(expectedToken, callbackToken)) {
    console.error("Xendit: callback token tidak cocok");
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  let body: XenditInvoiceCallback;
  try {
    body = (await request.json()) as XenditInvoiceCallback;
  } catch (err) {
    console.error("Xendit: gagal parse body callback:", err);
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();

    if (body.external_id.startsWith("HPP-")) {
      return await handleDesktopOrderCallback(supabase, body);
    }

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, business_id, plan_code, status")
      .eq("order_id", body.external_id)
      .maybeSingle();

    if (paymentError) {
      console.error(`Xendit: gagal query payments untuk ${body.external_id}:`, paymentError);
      return NextResponse.json({ error: "db error" }, { status: 500 });
    }

    if (!payment) {
      console.error(`Xendit callback for unknown order_id: ${body.external_id}`);
      return NextResponse.json({ ok: true });
    }

    if (payment.status === "settlement") {
      return NextResponse.json({ ok: true });
    }

    const newPaymentStatus =
      body.status === "PAID" ? "settlement" : body.status === "EXPIRED" ? "expire" : "pending";

    const { error: updatePaymentError } = await supabase
      .from("payments")
      .update({
        status: newPaymentStatus,
        midtrans_transaction_id: body.id,
        payment_type: body.payment_method ?? body.payment_channel ?? null,
        raw_notification: body,
      })
      .eq("id", payment.id);

    if (updatePaymentError) {
      console.error(`Xendit: gagal update payment ${payment.id}:`, updatePaymentError);
      return NextResponse.json({ error: "db error" }, { status: 500 });
    }

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
      const { data: subscription, error: subError } = await supabase
        .from("subscriptions")
        .select("period_end")
        .eq("business_id", payment.business_id)
        .maybeSingle();

      if (subError) {
        console.error(`Xendit: gagal query subscription untuk business ${payment.business_id}:`, subError);
        return NextResponse.json({ error: "db error" }, { status: 500 });
      }

      const now = Date.now();
      const currentPeriodEnd = subscription?.period_end
        ? new Date(subscription.period_end).getTime()
        : 0;
      const base = Math.max(now, currentPeriodEnd);
      newPeriodEnd = new Date(base + plan.periodDays * 24 * 60 * 60 * 1000).toISOString();
    }

    const { error: subUpdateError } = await supabase
      .from("subscriptions")
      .update({
        plan_code: plan.code,
        status: "active",
        period_end: newPeriodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("business_id", payment.business_id);

    if (subUpdateError) {
      console.error(`Xendit: gagal update subscription untuk business ${payment.business_id}:`, subUpdateError);
      return NextResponse.json({ error: "db error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`Xendit: unexpected error memproses order_id ${body.external_id}:`, err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
