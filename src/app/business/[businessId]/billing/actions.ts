"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/billing/plans";

const MIDTRANS_BASE_URL = process.env.MIDTRANS_IS_PRODUCTION === "true"
  ? "https://app.midtrans.com/snap/v1/transactions"
  : "https://app.sandbox.midtrans.com/snap/v1/transactions";

export type CreatePaymentResult = { error: string | null; redirectUrl: string | null };

export async function createPayment(
  businessId: string,
  planCode: string,
): Promise<CreatePaymentResult> {
  const plan = getPlan(planCode);
  if (!plan) {
    return { error: "Paket tidak ditemukan.", redirectUrl: null };
  }

  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { error: "Sesi login tidak ditemukan, silakan login ulang.", redirectUrl: null };
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (!business) {
    return { error: "Bisnis tidak ditemukan.", redirectUrl: null };
  }

  const orderId = `KK-${businessId.slice(0, 8)}-${Date.now()}`;

  const { error: insertError } = await supabase.from("payments").insert({
    business_id: businessId,
    plan_code: plan.code,
    order_id: orderId,
    amount: plan.price,
    status: "pending",
  });

  if (insertError) {
    return { error: `Gagal mencatat pembayaran: ${insertError.message}`, redirectUrl: null };
  }

  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    return { error: "Konfigurasi payment gateway belum lengkap.", redirectUrl: null };
  }

  const auth = Buffer.from(`${serverKey}:`).toString("base64");

  // finish callback is cosmetic only (not authoritative — the webhook is),
  // so a best-effort origin from request headers is fine here.
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : "";

  const response = await fetch(MIDTRANS_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      transaction_details: {
        order_id: orderId,
        gross_amount: plan.price,
      },
      item_details: [
        { id: plan.code, name: plan.name, price: plan.price, quantity: 1 },
      ],
      customer_details: {
        email: userData.user.email,
        first_name: business.name,
      },
      callbacks: {
        finish: `${origin}/business/${businessId}/billing?status=selesai`,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return { error: `Gagal membuat transaksi pembayaran: ${body}`, redirectUrl: null };
  }

  const json = (await response.json()) as { redirect_url?: string };
  if (!json.redirect_url) {
    return { error: "Payment gateway tidak mengembalikan link pembayaran.", redirectUrl: null };
  }

  return { error: null, redirectUrl: json.redirect_url };
}
