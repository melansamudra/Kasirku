import ExcelJS from "exceljs";

const COLUMNS = [
  { header: "Nama Menu", key: "itemName", width: 28 },
  { header: "Porsi", key: "porsi", width: 10 },
  { header: "Nama Bahan", key: "bahan", width: 28 },
  { header: "Qty", key: "qty", width: 12 },
  { header: "Satuan", key: "satuan", width: 12 },
  { header: "Harga", key: "harga", width: 14 },
];

export async function GET() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Resep");

  sheet.columns = COLUMNS;

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16A34A" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 20;

  // "Nama Bahan" boleh nama Bahan Baku ATAU nama Bahan Setengah Jadi yang
  // sudah ada di sistem (mis. "Ayam Boiler Ungkep") -- sistem otomatis cari
  // di kedua daftar itu. Porsi untuk produk jadi yang cuma 1x plating per
  // 1 sajian, biasanya cukup isi 1 (qty = langsung per 1 porsi jual).
  sheet.addRow({ itemName: "Nasi Ayam Boiler", porsi: 1, bahan: "Nasi Putih", qty: 200, satuan: "gr", harga: 12 });
  sheet.addRow({ itemName: "Nasi Ayam Boiler", porsi: 1, bahan: "Ayam Boiler Ungkep", qty: 1, satuan: "porsi", harga: 0 });
  sheet.addRow({ itemName: "Nasi Ayam Boiler", porsi: 1, bahan: "Sambal terasi", qty: 0.5, satuan: "porsi", harga: 0 });

  sheet.getColumn("qty").numFmt = "#,##0.####";
  sheet.getColumn("harga").numFmt = "#,##0";
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-resep-produk-jadi.xlsx"',
    },
  });
}
