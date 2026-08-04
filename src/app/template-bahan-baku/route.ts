import ExcelJS from "exceljs";

const COLUMNS = [
  { header: "Nama", key: "name", width: 30 },
  { header: "Satuan", key: "unit", width: 15 },
  { header: "Harga per Satuan", key: "unitCost", width: 20 },
  { header: "Stok", key: "stock", width: 10 },
  { header: "Stok Minimum", key: "minStock", width: 15 },
];

export async function GET() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Bahan Baku");

  sheet.columns = COLUMNS;

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16A34A" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 20;

  // Contoh data
  sheet.addRow({ name: "Gula Pasir", unit: "gr", unitCost: 15, stock: 5000, minStock: 500 });
  sheet.addRow({ name: "Kopi Robusta", unit: "gr", unitCost: 80, stock: 2000, minStock: 200 });
  sheet.addRow({ name: "Susu Full Cream", unit: "ml", unitCost: 20, stock: 3000, minStock: 300 });

  sheet.getColumn("unitCost").numFmt = '#,##0';
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-bahan-baku.xlsx"',
    },
  });
}
