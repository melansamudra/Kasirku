import ExcelJS from "exceljs";

const COLUMNS = [
  { header: "Menu", key: "menu", width: 35 },
  { header: "Kategori", key: "kategori", width: 20 },
  { header: "Harga", key: "harga", width: 15 },
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

  // Contoh data -- kalau nama Menu SUDAH ada di Produk Jadi (HPP), Kategori &
  // Harga di baris itu diabaikan (dianggap sudah benar di sana). Kalau BELUM
  // ada, Produk Jadi baru otomatis dibuat pakai Kategori & Harga dari baris
  // ini -- jadi kolom itu wajib diisi buat menu yang belum ada di sistem.
  sheet.addRow({ menu: "Nasi Goreng", kategori: "Makanan", harga: 25000, qty: 24 });
  sheet.addRow({ menu: "Es Teh", kategori: "Minuman", harga: 8000, qty: 15 });

  sheet.getColumn("harga").numFmt = "#,##0";
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-rekap-penjualan.xlsx"',
    },
  });
}
