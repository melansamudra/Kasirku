import { createClient } from "@/lib/supabase/server";
import { assertBusinessAccess } from "@/lib/route-auth";
import { fetchAllRows } from "@/lib/pagination";
import { toCsv } from "@/lib/csv";

// Format kolom sama persis dengan format impor sehingga file ini bisa
// langsung dipakai kembali sebagai file impor.
const HEADER = ["Referensi", "Tanggal", "Nama Produk", "Qty", "Metode Bayar", "Pelanggan"];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await params;
  const business = await assertBusinessAccess(businessId);
  if (!business) return new Response("Forbidden", { status: 403 });

  const supabase = await createClient();

  // Dibungkus fetchAllRows karena Supabase/PostgREST diam-diam memotong
  // hasil di 1000 baris kalau tidak di-paginate (lihat lib/pagination.ts)
  // -- fitur ini namanya "export-full", jadi wajib benar-benar lengkap.
  const transactions = await fetchAllRows<{
    invoice_number: string;
    date: string;
    voided: boolean;
    customers: { name: string } | null;
    transaction_payments: { method: string }[];
    transaction_items: { name: string; qty: number }[];
  }>((rangeFrom, rangeTo) =>
    supabase
      .from("transactions")
      .select(
        "invoice_number, date, voided, customers(name), transaction_payments(method), transaction_items(name, qty)",
      )
      .eq("business_id", businessId)
      .eq("voided", false)
      .order("date", { ascending: false })
      .range(rangeFrom, rangeTo),
  );

  const rows: (string | number)[][] = [HEADER];

  for (const t of transactions) {
    const reference = t.invoice_number;
    const date = new Date(t.date).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
    const paymentMethod = t.transaction_payments[0]?.method ?? "";
    const customerName = t.customers?.name ?? "";
    const items = t.transaction_items;

    for (const item of items) {
      rows.push([reference, date, item.name, Number(item.qty), paymentMethod, customerName]);
    }

    // Transaksi tanpa item tetap masuk dengan baris kosong agar referensi
    // tidak hilang dari file.
    if (items.length === 0) {
      rows.push([reference, date, "", "", paymentMethod, customerName]);
    }
  }

  const filename = `Transaksi_Detail_${business.name.replace(/[^a-zA-Z0-9]+/g, "_")}.csv`;

  return new Response(String.fromCharCode(0xfeff) + toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
