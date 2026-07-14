"use server";

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { getDesktopProduct } from "@/lib/billing/desktop-products";

const MIDTRANS_BASE_URL = process.env.MIDTRANS_IS_PRODUCTION === "true"
  ? "https://app.midtrans.com/snap/v1/transactions"
  : "https://app.sandbox.midtrans.com/snap/v1/transactions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CreateDesktopOrderResult = { error: string | null; redirectUrl: string | null };

// Guest checkout — tidak ada sesi login sama sekali (pembeli tanpa akun
// KasirKu), jadi pakai service-role client (lihat komentar di
// src/lib/supabase/service.ts) untuk menulis ke tabel yang RLS-nya sengaja
// tanpa policy publik.
export async function createDesktopOrder(
  email: string,
  productCode: string,
): Promise<CreateDesktopOrderResult> {
  const trimmedEmail = email.trim();
  if (!trimmedEmail || !EMAIL_RE.test(trimmedEmail)) {
    return { error: "Email tidak valid.", redirectUrl: null };
  }

  const product = getDesktopProduct(productCode);
  if (!product) {
    return { error: "Produk tidak ditemukan.", redirectUrl: null };
  }

  const supabase = createServiceClient();
  const orderId = `HPP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { error: insertError } = await supabase.from("hpp_desktop_orders").insert({
    order_id: orderId,
    email: trimmedEmail,
    amount: product.price,
    status: "pending",
  });

  if (insertError) {
    return { error: `Gagal mencatat pesanan: ${insertError.message}`, redirectUrl: null };
  }

  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    return { error: "Konfigurasi payment gateway belum lengkap.", redirectUrl: null };
  }

  const auth = Buffer.from(`${serverKey}:`).toString("base64");

  // finish callback cosmetic only (not authoritative — webhook is), best
  // effort origin sama seperti billing/actions.ts.
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
      transaction_details: { order_id: orderId, gross_amount: product.price },
      item_details: [
        { id: product.code, name: product.name, price: product.price, quantity: 1 },
      ],
      customer_details: { email: trimmedEmail },
      callbacks: {
        finish: `${origin}/kalkulator-hpp/beli/selesai?order_id=${orderId}`,
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
