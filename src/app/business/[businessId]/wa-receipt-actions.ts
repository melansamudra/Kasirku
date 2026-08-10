"use server";

import { createClient } from "@/lib/supabase/server";

export async function buildWhatsAppReceiptText(
  businessId: string,
  transactionId: string,
): Promise<string | null> {
  const supabase = await createClient();

  const [{ data: business }, { data: transaction }, { data: items }, { data: payments }] =
    await Promise.all([
      supabase.from("businesses").select("name").eq("id", businessId).single(),
      supabase
        .from("transactions")
        .select(
          "invoice_number, date, subtotal_raw, total_item_disc, order_disc_amt, service, tax, total, order_label, customer_name, cashiers!transactions_cashier_id_fkey(name)",
        )
        .eq("id", transactionId)
        .eq("business_id", businessId)
        .single(),
      supabase
        .from("transaction_items")
        .select("name, price, qty")
        .eq("transaction_id", transactionId)
        .order("id", { ascending: true }),
      supabase
        .from("transaction_payments")
        .select("method, amount, received, change")
        .eq("transaction_id", transactionId),
    ]);

  if (!business || !transaction) return null;

  type Tx = {
    invoice_number: string | null;
    date: string;
    subtotal_raw: number;
    total_item_disc: number | null;
    order_disc_amt: number | null;
    service: number | null;
    tax: number | null;
    total: number;
    order_label?: string | null;
    customer_name?: string | null;
    cashiers: { name: string } | null;
  };
  const tx = transaction as unknown as Tx;
  const biz = business as unknown as { name: string };

  const fmt = (v: number) => `Rp${Math.round(v).toLocaleString("id-ID")}`;
  const dateStr = new Date(tx.date).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const lines: string[] = [];
  lines.push(`*${biz.name}*`);
  if (tx.invoice_number) lines.push(`No: ${tx.invoice_number}`);
  lines.push(dateStr);

  const meta: string[] = [];
  if ((tx.cashiers as unknown as { name: string } | null)?.name)
    meta.push(`Kasir: ${(tx.cashiers as unknown as { name: string }).name}`);
  if (tx.order_label) meta.push(`Meja: ${tx.order_label}`);
  if (tx.customer_name) meta.push(`Pelanggan: ${tx.customer_name}`);
  if (meta.length) lines.push(meta.join(" | "));

  lines.push("");
  for (const item of items ?? []) {
    const subtotal = Number(item.price) * Number(item.qty);
    lines.push(`• ${item.name} (${item.qty}×) — ${fmt(subtotal)}`);
  }

  lines.push("");
  lines.push(`Subtotal: ${fmt(Number(tx.subtotal_raw))}`);
  if (Number(tx.total_item_disc) > 0)
    lines.push(`Diskon: -${fmt(Number(tx.total_item_disc))}`);
  if (Number(tx.order_disc_amt) > 0)
    lines.push(`Diskon order: -${fmt(Number(tx.order_disc_amt))}`);
  if (Number(tx.service) > 0) lines.push(`Layanan: ${fmt(Number(tx.service))}`);
  if (Number(tx.tax) > 0) lines.push(`PPN: ${fmt(Number(tx.tax))}`);
  lines.push(`*Total: ${fmt(Number(tx.total))}*`);

  lines.push("");
  for (const p of payments ?? []) {
    lines.push(`${p.method}: ${fmt(Number(p.amount))}`);
    if (p.received !== null && Number(p.received) > 0)
      lines.push(`  Diterima: ${fmt(Number(p.received))}`);
    if (p.change !== null && Number(p.change) > 0)
      lines.push(`  Kembalian: ${fmt(Number(p.change))}`);
  }

  lines.push("");
  lines.push("Terima kasih! 🙏");

  return lines.join("\n");
}
