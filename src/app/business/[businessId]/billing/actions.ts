"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/billing/plans";

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

  const secretKey = process.env.XENDIT_SECRET_KEY;
  if (!secretKey) {
    return { error: "Konfigurasi payment gateway belum lengkap.", redirectUrl: null };
  }

  const auth = Buffer.from(`${secretKey}:`).toString("base64");

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : "";

  const response = await fetch("https://api.xendit.co/v2/invoices", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      external_id: orderId,
      amount: plan.price,
      payer_email: userData.user.email,
      description: `KasirKu — ${plan.name}`,
      success_redirect_url: `${origin}/business/${businessId}/billing?status=selesai`,
      failure_redirect_url: `${origin}/business/${businessId}/billing`,
      currency: "IDR",
      items: [{ name: plan.name, quantity: 1, price: plan.price }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return { error: `Gagal membuat transaksi pembayaran: ${body}`, redirectUrl: null };
  }

  const json = (await response.json()) as { invoice_url?: string };
  if (!json.invoice_url) {
    return { error: "Payment gateway tidak mengembalikan link pembayaran.", redirectUrl: null };
  }

  return { error: null, redirectUrl: json.invoice_url };
}
