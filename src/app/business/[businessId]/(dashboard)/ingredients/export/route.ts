import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";

const HEADER = ["Nama", "Satuan", "Harga per Satuan", "Stok", "Stok Minimum"];

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

  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("name, unit, unit_cost, stock, min_stock")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const rows: (string | number)[][] = [HEADER];
  for (const i of ingredients ?? []) {
    rows.push([i.name, i.unit, Number(i.unit_cost), Number(i.stock), Number(i.min_stock)]);
  }

  const filename = `BahanBaku_${business.name.replace(/[^a-zA-Z0-9]+/g, "_")}.csv`;

  // BOM (U+FEFF) supaya Excel membuka file sebagai UTF-8.
  return new Response(String.fromCharCode(0xfeff) + toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
