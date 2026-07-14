import { createHash, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getPlan } from "@/lib/billing/plans";

type MidtransNotification = {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_status: string;
  payment_type?: string;
  transaction_id?: string;
};

const SETTLED_STATUSES = new Set(["capture", "settlement"]);
const FAILED_STATUSES = new Set(["deny", "cancel", "expire"]);

// Kalkulator HPP Desktop — pesanan sekali-beli tanpa akun/business_id sama
// sekali (lihat 20260713130000_hpp_desktop_orders.sql). Order ID-nya diberi
// prefix "HPP-" (dibuat di kalkulator-hpp/beli/actions.ts) supaya bisa
// dibedakan dari order langganan bisnis ("KK-...") di webhook yang sama —
// Midtrans hanya punya satu URL notifikasi per akun, jadi ini tidak bisa
// dipecah jadi route terpisah.
async function handleDesktopOrderNotification(
  supabase: ReturnType<typeof createServiceClient>,
  body: MidtransNotification,
) {
  const { data: order } = await supabase
    .from("hpp_desktop_orders")
    .select("id, status")
    .eq("order_id", body.order_id)
    .maybeSingle();

  if (!order) {
    console.error(`Midtrans notification for unknown hpp_desktop_orders order_id: ${body.order_id}`);
    return NextResponse.json({ ok: true });
  }

  if (order.status === "settlement") {
    // Sudah diproses — Midtrans mengulang notifikasi, ini normal.
    return NextResponse.json({ ok: true });
  }

  const newStatus = SETTLED_STATUSES.has(body.transaction_status)
    ? "settlement"
    : FAILED_STATUSES.has(body.transaction_status)
      ? body.transaction_status
      : "pending";

  await supabase
    .from("hpp_desktop_orders")
    .update({
      status: newStatus,
      midtrans_transaction_id: body.transaction_id ?? null,
      payment_type: body.payment_type ?? null,
      raw_notification: body,
      ...(newStatus === "settlement" ? { download_token: randomUUID() } : {}),
    })
    .eq("id", order.id);

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const body = (await request.json()) as MidtransNotification;

  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const expectedSignature = createHash("sha512")
    .update(`${body.order_id}${body.status_code}${body.gross_amount}${serverKey}`)
    .digest("hex");

  if (expectedSignature !== body.signature_key) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const supabase = createServiceClient();

  if (body.order_id.startsWith("HPP-")) {
    return handleDesktopOrderNotification(supabase, body);
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("id, business_id, plan_code, status")
    .eq("order_id", body.order_id)
    .maybeSingle();

  if (!payment) {
    // Unknown order_id — nothing to do, but still ack so Midtrans stops retrying.
    console.error(`Midtrans notification for unknown order_id: ${body.order_id}`);
    return NextResponse.json({ ok: true });
  }

  if (payment.status === "settlement") {
    // Already processed — Midtrans retries notifications, this is expected.
    return NextResponse.json({ ok: true });
  }

  const newPaymentStatus = SETTLED_STATUSES.has(body.transaction_status)
    ? "settlement"
    : FAILED_STATUSES.has(body.transaction_status)
      ? body.transaction_status
      : "pending";

  await supabase
    .from("payments")
    .update({
      status: newPaymentStatus,
      midtrans_transaction_id: body.transaction_id ?? null,
      payment_type: body.payment_type ?? null,
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
