import ExcelJS from "exceljs";

const COLUMNS = [
  { header: "Nama BSJ", key: "name", width: 30 },
  { header: "Harga (HPP manual)", key: "price", width: 20 },
  { header: "Bagian", key: "section", width: 25 },
  { header: "Satuan (opsional)", key: "unit", width: 18 },
];

export async function GET() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("BSJ Manual");

  sheet.columns = COLUMNS;

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16A34A" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 20;

  // Contoh data
  sheet.addRow({ name: "Bumbu Dasar Kuning", price: 12500, section: "Bumbu", unit: "kg" });
  sheet.addRow({ name: "Sambal Matah", price: 18000, section: "Sambal, Topping", unit: "kg" });
  sheet.addRow({ name: "Ayam Kalasan Ungkep", price: 45000, section: "Ungkepan", unit: "" });

  sheet.getColumn("price").numFmt = "#,##0";
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-bsj-manual.xlsx"',
    },
  });
}
