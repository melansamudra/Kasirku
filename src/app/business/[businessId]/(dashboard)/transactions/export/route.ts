import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";

const HEADER = [
  "No Invoice",
  "Tanggal",
  "Kasir",
  "Pelanggan",
  "Metode Bayar",
  "Subtotal",
  "Diskon Item",
  "Diskon Order",
  "Layanan",
  "Pajak",
  "Total",
  "Status",
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (!business) {
    return new Response("Toko tidak ditemukan.", { status: 404 });
  }

  const { data: transactions } = await supabase
    .from("transactions")
    .select(
      "invoice_number, date, subtotal, total_item_disc, order_disc_amt, service, tax, total, voided, cashiers!transactions_cashier_id_fkey(name), customers(name), transaction_payments(method)",
    )
    .eq("business_id", businessId)
    .order("date", { ascending: false });

  const rows: (string | number)[][] = [HEADER];
  for (const t of transactions ?? []) {
    rows.push([
      t.invoice_number,
      new Date(t.date).toLocaleString("id-ID"),
      (t.cashiers as unknown as { name: string } | null)?.name ?? "",
      (t.customers as unknown as { name: string } | null)?.name ?? "",
      t.transaction_payments?.[0]?.method ?? "",
      Number(t.subtotal),
      Number(t.total_item_disc),
      Number(t.order_disc_amt),
      Number(t.service),
      Number(t.tax),
      Number(t.total),
      t.voided ? "Dibatalkan" : "Selesai",
    ]);
  }

  const filename = `Transaksi_${business.name.replace(/[^a-zA-Z0-9]+/g, "_")}.csv`;

  // BOM (U+FEFF) supaya Excel membuka file sebagai UTF-8.
  return new Response(String.fromCharCode(0xfeff) + toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
