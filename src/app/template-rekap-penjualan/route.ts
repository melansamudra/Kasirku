import ExcelJS from "exceljs";

const COLUMNS = [
  { header: "Menu", key: "menu", width: 35 },
  { header: "Qty", key: "qty", width: 12 },
];

export async function GET() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Rekap Penjualan");

  sheet.columns = COLUMNS;

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16A34A" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 20;

  // Contoh data -- nama Menu harus sama persis dengan Produk Jadi (HPP) di
  // aplikasi, Qty diisi total terjual sepanjang periode yang mau direkap.
  sheet.addRow({ menu: "Nasi Goreng", qty: 24 });
  sheet.addRow({ menu: "Es Teh", qty: 15 });

  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-rekap-penjualan.xlsx"',
    },
  });
}
