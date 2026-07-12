import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";

const HEADER = [
  "Nama",
  "Kategori",
  "Harga Jual",
  "Modal (HPP)",
  "Stok",
  "Stok Minimum",
  "Barcode",
  "SKU",
  "Varian",
  "Emoji",
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

  const { data: products } = await supabase
    .from("products")
    .select("name, category, price, cost, stock, min_stock, barcode, sku, variant_label, emoji")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const rows: (string | number)[][] = [HEADER];
  for (const p of products ?? []) {
    rows.push([
      p.name,
      p.category ?? "",
      Number(p.price),
      Number(p.cost),
      Number(p.stock),
      Number(p.min_stock),
      p.barcode ?? "",
      p.sku ?? "",
      p.variant_label ?? "",
      p.emoji ?? "",
    ]);
  }

  const filename = `Produk_${business.name.replace(/[^a-zA-Z0-9]+/g, "_")}.csv`;

  // BOM (U+FEFF) supaya Excel membuka file sebagai UTF-8.
  return new Response(String.fromCharCode(0xfeff) + toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
