import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";

const HEADERS = [
  { header: "Nama", key: "name", width: 30 },
  { header: "Satuan", key: "unit", width: 15 },
  { header: "Harga per Satuan", key: "unitCost", width: 20 },
  { header: "Stok", key: "stock", width: 10 },
  { header: "Stok Minimum", key: "minStock", width: 15 },
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

  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("name, unit, unit_cost, stock, min_stock")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Bahan Baku");

  sheet.columns = HEADERS;

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16A34A" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 20;

  for (const i of ingredients ?? []) {
    sheet.addRow({
      name: i.name,
      unit: i.unit,
      unitCost: Number(i.unit_cost),
      stock: Number(i.stock),
      minStock: Number(i.min_stock),
    });
  }

  sheet.getColumn("unitCost").numFmt = '#,##0';
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `BahanBaku_${business.name.replace(/[^a-zA-Z0-9]+/g, "_")}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
