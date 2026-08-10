import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { assertBusinessAccess } from "@/lib/route-auth";

const HEADERS = [
  { header: "Nama", key: "name", width: 30 },
  { header: "Kategori", key: "category", width: 20 },
  { header: "Harga Jual", key: "price", width: 15 },
  { header: "Modal (HPP)", key: "cost", width: 15 },
  { header: "Stok", key: "stock", width: 10 },
  { header: "Stok Minimum", key: "minStock", width: 15 },
  { header: "Barcode", key: "barcode", width: 20 },
  { header: "SKU", key: "sku", width: 15 },
  { header: "Varian", key: "variantLabel", width: 15 },
  { header: "Emoji", key: "emoji", width: 10 },
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await params;
  const business = await assertBusinessAccess(businessId);
  if (!business) return new Response("Forbidden", { status: 403 });

  const supabase = await createClient();

  const { data: products } = await supabase
    .from("products")
    .select("name, category, price, cost, stock, min_stock, barcode, sku, variant_label, emoji")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Produk");

  sheet.columns = HEADERS;

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16A34A" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 20;

  // Add data rows
  for (const p of products ?? []) {
    sheet.addRow({
      name: p.name,
      category: p.category ?? "",
      price: Number(p.price),
      cost: Number(p.cost),
      stock: Number(p.stock),
      minStock: Number(p.min_stock),
      barcode: p.barcode ?? "",
      sku: p.sku ?? "",
      variantLabel: p.variant_label ?? "",
      emoji: p.emoji ?? "",
    });
  }

  // Format price & cost columns as currency
  sheet.getColumn("price").numFmt = '#,##0';
  sheet.getColumn("cost").numFmt = '#,##0';

  // Freeze header row
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `Produk_${business.name.replace(/[^a-zA-Z0-9]+/g, "_")}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
