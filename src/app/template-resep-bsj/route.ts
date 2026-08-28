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

  // Contoh data -- "Nama Menu" & "Porsi" diulang di tiap baris bahan
  // (bukan cuma baris pertama), qty = total bahan untuk 1 KALI batch produksi
  // (bukan per-1-porsi), harga cuma dipakai kalau nama bahan belum ada di
  // sistem (buat bahan baku baru).
  sheet.addRow({ itemName: "Ayam Suwir", porsi: 30, bahan: "Ayam Dada Fillet", qty: 1500, satuan: "gr", harga: 48 });
  sheet.addRow({ itemName: "Ayam Suwir", porsi: 30, bahan: "Air", qty: 200, satuan: "ml", harga: 0 });
  sheet.addRow({ itemName: "Sambal Terasi", porsi: 72, bahan: "Cabe Merah Keriting", qty: 3000, satuan: "gr", harga: 53 });
  sheet.addRow({ itemName: "Sambal Terasi", porsi: 72, bahan: "Terasi", qty: 300, satuan: "gr", harga: 55 });
  sheet.addRow({ itemName: "Sambal Terasi", porsi: 72, bahan: "Garam", qty: 60, satuan: "gr", harga: 19 });

  sheet.getColumn("qty").numFmt = "#,##0.####";
  sheet.getColumn("harga").numFmt = "#,##0";
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-resep-bsj.xlsx"',
    },
  });
}
