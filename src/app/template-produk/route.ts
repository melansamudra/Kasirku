import ExcelJS from "exceljs";

const COLUMNS = [
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

export async function GET() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Produk");

  sheet.columns = COLUMNS;

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16A34A" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 20;

  // Contoh data
  sheet.addRow({ name: "Kopi Hitam", category: "Minuman", price: 10000, cost: 4000, stock: 50, minStock: 5, barcode: "", sku: "", variantLabel: "", emoji: "☕" });
  sheet.addRow({ name: "Nasi Goreng", category: "Makanan", price: 25000, cost: 10000, stock: 0, minStock: 0, barcode: "", sku: "NG-001", variantLabel: "", emoji: "🍳" });
  sheet.addRow({ name: "Teh Manis", category: "Minuman", price: 8000, cost: 2000, stock: 100, minStock: 10, barcode: "8991234567890", sku: "", variantLabel: "", emoji: "🍵" });

  sheet.getColumn("price").numFmt = '#,##0';
  sheet.getColumn("cost").numFmt = '#,##0';
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-produk.xlsx"',
    },
  });
}
