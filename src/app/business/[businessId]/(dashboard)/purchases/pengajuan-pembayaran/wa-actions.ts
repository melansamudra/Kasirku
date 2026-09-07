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
// Owner tersimpan di sistem ini). Satu pengajuan bisa berisi banyak hutang
// dari beberapa supplier sekaligus -- dirinci per supplier + rekening
// tujuannya biar Owner tahu harus transfer ke mana saja.
export async function buildPaymentRequestWaText(businessId: string, requestId: string): Promise<string | null> {
  const supabase = await createClient();

  const [{ data: business }, { data: request }, { data: items }] = await Promise.all([
    supabase.from("businesses").select("name").eq("id", businessId).single(),
    supabase
      .from("purchase_payment_requests")
      .select("amount, payment_method, note, requested_by_name, created_at")
      .eq("id", requestId)
      .eq("business_id", businessId)
      .single(),
    supabase
      .from("purchase_payment_request_items")
      .select("amount, purchases(date, category, note, supplier_id, suppliers(name, bank_name, bank_account_number, bank_account_holder))")
      .eq("request_id", requestId)
      .eq("business_id", businessId),
  ]);

  if (!business || !request) return null;

  type Item = {
    amount: number;
    purchases: {
      date: string;
      category: string;
      note: string | null;
      supplier_id: string | null;
      suppliers: {
        name: string;
        bank_name: string | null;
        bank_account_number: string | null;
        bank_account_holder: string | null;
      } | null;
    } | null;
  };
  const rows = (items ?? []) as unknown as Item[];

  const bySupplier = new Map<string, { name: string; bank: string | null; rows: Item[] }>();
  for (const it of rows) {
    const supplier = it.purchases?.suppliers;
    const key = it.purchases?.supplier_id ?? "__tanpa_supplier__";
    const entry = bySupplier.get(key) ?? {
      name: supplier?.name ?? "Tanpa Supplier",
      bank:
        supplier?.bank_account_number
          ? `${supplier.bank_name ? `${supplier.bank_name} — ` : ""}${supplier.bank_account_number}${
              supplier.bank_account_holder ? ` a.n. ${supplier.bank_account_holder}` : ""
            }`
          : null,
      rows: [],
    };
    entry.rows.push(it);
    bySupplier.set(key, entry);
  }

  const lines: string[] = [];
  lines.push(`*${(business as unknown as { name: string }).name}*`);
  lines.push("PENGAJUAN PEMBAYARAN HUTANG");
  lines.push("");

  for (const { name, bank, rows: supplierRows } of bySupplier.values()) {
    const subtotal = supplierRows.reduce((s, r) => s + Number(r.amount), 0);
    lines.push(`*${name}*${bank ? ` — ${bank}` : ""}`);
    for (const r of supplierRows) {
      if (!r.purchases) continue;
      lines.push(`  • ${fmtDate(r.purchases.date)} ${r.purchases.note || r.purchases.category} — ${fmt(Number(r.amount))}`);
    }
    lines.push(`  Subtotal: ${fmt(subtotal)}`);
    lines.push("");
  }

  lines.push(`*Total Diajukan: ${fmt(Number(request.amount))}* (${request.payment_method === "transfer" ? "Transfer" : "Tunai"})`);
  if (request.note) lines.push(`Catatan: ${request.note}`);
  lines.push(`Diajukan oleh: ${request.requested_by_name}`);
  lines.push("");
  lines.push(`Cek & setujui di: ${SITE_URL}/business/${businessId}/purchases/pengajuan-pembayaran/${requestId}`);

  return lines.join("\n");
}
