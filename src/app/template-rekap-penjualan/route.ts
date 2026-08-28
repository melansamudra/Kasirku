import ExcelJS from "exceljs";

const COLUMNS = [
  { header: "Tanggal", key: "tanggal", width: 14 },
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

  // Contoh data -- Tanggal format YYYY-MM-DD, baris dengan Tanggal yang sama
  // digabung jadi 1 transaksi (banyak menu sekaligus). Kalau Tanggal di
  // suatu baris dikosongkan, dipakai "Tanggal Default" yang diisi di form
  // upload -- berguna kalau sumber datanya cuma total sebulan (mis. rekap
  // ESB) tanpa breakdown harian, tinggal kosongkan semua Tanggal & pakai 1
  // tanggal default buat semuanya.
  //
  // Kategori & Harga cuma dipakai kalau nama Menu BELUM ada di Produk Jadi
  // (HPP) -- Produk Jadi baru otomatis dibuat pakai nilai itu. Kalau menu-nya
  // sudah ada, dua kolom itu diabaikan (dianggap sudah benar di sana).
  sheet.addRow({ tanggal: "2026-06-01", menu: "Nasi Goreng", kategori: "Makanan", harga: 25000, qty: 5 });
  sheet.addRow({ tanggal: "2026-06-01", menu: "Es Teh", kategori: "Minuman", harga: 8000, qty: 3 });
  sheet.addRow({ tanggal: "2026-06-02", menu: "Nasi Goreng", kategori: "Makanan", harga: 25000, qty: 8 });

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
