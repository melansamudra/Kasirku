"use server";

import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";

function fmt(v: number) {
  return `Rp${Math.round(v).toLocaleString("id-ID")}`;
}
function fmtDate(d: string) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Teks pesan WA buat pengajuan pembayaran -- dikirim TANPA nomor tujuan
// (wa.me/?text=...) sama seperti buildWhatsAppReceiptText, biar admin yang
// pilih kontak Owner sendiri dari WhatsApp-nya (tidak ada field nomor HP
// Owner tersimpan di sistem ini).
export async function buildPaymentRequestWaText(businessId: string, requestId: string): Promise<string | null> {
  const supabase = await createClient();

  const [{ data: business }, { data: request }] = await Promise.all([
    supabase.from("businesses").select("name").eq("id", businessId).single(),
    supabase
      .from("purchase_payment_requests")
      .select(
        "amount, payment_method, note, status, requested_by_name, created_at, purchases(date, category, note, amount, paid_amount, supplier_id, suppliers(name))",
      )
      .eq("id", requestId)
      .eq("business_id", businessId)
      .single(),
  ]);

  if (!business || !request) return null;

  type Row = {
    amount: number;
    payment_method: string;
    note: string | null;
    status: string;
    requested_by_name: string;
    created_at: string;
    purchases: {
      date: string;
      category: string;
      note: string | null;
      amount: number;
      paid_amount: number;
      supplier_id: string | null;
      suppliers: { name: string } | null;
    } | null;
  };
  const r = request as unknown as Row;
  const purchase = r.purchases;
  const supplierName = purchase?.suppliers?.name ?? "—";
  const sisaSebelum = purchase ? Number(purchase.amount) - Number(purchase.paid_amount) : 0;

  const lines: string[] = [];
  lines.push(`*${(business as unknown as { name: string }).name}*`);
  lines.push("PENGAJUAN PEMBAYARAN HUTANG");
  lines.push("");
  lines.push(`Supplier: ${supplierName}`);
  if (purchase) {
    lines.push(`Pembelian: ${fmtDate(purchase.date)} — ${purchase.note || purchase.category} (${fmt(Number(purchase.amount))})`);
    lines.push(`Sisa Hutang saat ini: ${fmt(sisaSebelum)}`);
  }
  lines.push("");
  lines.push(`*Diajukan: ${fmt(Number(r.amount))}* (${r.payment_method === "transfer" ? "Transfer" : "Tunai"})`);
  if (r.note) lines.push(`Catatan: ${r.note}`);
  lines.push(`Diajukan oleh: ${r.requested_by_name}`);
  lines.push("");
  lines.push(`Cek & setujui di: ${SITE_URL}/business/${businessId}/purchases/pengajuan-pembayaran/${requestId}`);

  return lines.join("\n");
}
