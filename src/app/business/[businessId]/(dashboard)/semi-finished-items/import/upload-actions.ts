"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type UploadState = {
  error: string | null;
  report: { itemCount: number; rowCount: number; newIngredients: string[]; skippedRows: number } | null;
};

const HEADER_ALIASES: Record<string, string[]> = {
  itemName: ["nama menu", "nama bsj", "nama bahan setengah jadi"],
  porsi: ["porsi", "jml produksi", "jumlah produksi"],
  bahan: ["bahan baku", "bahan"],
  gramasi: ["gramasi", "qty", "jumlah"],
  satuan: ["satuan"],
  harga: ["harga", "harga satuan"],
};

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "richText" in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
  }
  return String(v).trim();
}

function cellNumber(cell: ExcelJS.Cell): number {
  const v = cell.value;
  if (v === null || v === undefined) return 0;
  if (typeof v === "object" && "result" in v) {
    const r = (v as { result?: unknown }).result;
    return typeof r === "number" ? r : 0;
  }
  return typeof v === "number" ? v : Number(v) || 0;
}

export async function uploadDataglobalExcel(
  businessId: string,
  _prevState: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { error: "Pilih file Excel dulu.", report: null };
  }

  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    return { error: "File tidak bisa dibaca sebagai Excel (.xlsx).", report: null };
  }

  const ws = wb.worksheets.find((s) => /dataglobal/i.test(s.name)) ?? wb.worksheets[0];
  if (!ws) {
    return { error: "Tidak ada sheet di file ini.", report: null };
  }

  // Cari baris header (baris yang punya kolom "Nama Menu") di antara 15 baris pertama.
  let headerRow = -1;
  const colIndex: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};
  for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const found: typeof colIndex = {};
    for (let c = 1; c <= ws.columnCount; c++) {
      const text = cellText(row.getCell(c)).toLowerCase();
      if (!text) continue;
      for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
        if (aliases.some((a) => text === a)) {
          found[key as keyof typeof HEADER_ALIASES] = c;
        }
      }
    }
    if (found.itemName && found.bahan && found.gramasi) {
      headerRow = r;
      Object.assign(colIndex, found);
      break;
    }
  }
  if (headerRow === -1) {
    return {
      error: 'Header kolom tidak ditemukan. Pastikan ada kolom "Nama Menu", "Bahan Baku", dan "Gramasi".',
      report: null,
    };
  }

  const supabase = await createClient();
  const { data: existingIngredients } = await supabase
    .from("ingredients")
    .select("id, name, unit")
    .eq("business_id", businessId)
    .is("deleted_at", null);
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const byName = new Map((existingIngredients ?? []).map((i) => [norm(i.name), i]));

  type ParsedRow = { itemName: string; porsi: number; bahan: string; gramasi: number; satuan: string; harga: number };
  const parsed: ParsedRow[] = [];
  let skippedRows = 0;
  let lastItemName = "";
  let lastPorsi = 0;
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const itemNameCell = colIndex.itemName ? cellText(row.getCell(colIndex.itemName)) : "";
    const porsiCell = colIndex.porsi ? cellNumber(row.getCell(colIndex.porsi)) : 0;
    const bahan = colIndex.bahan ? cellText(row.getCell(colIndex.bahan)) : "";
    const gramasi = colIndex.gramasi ? cellNumber(row.getCell(colIndex.gramasi)) : 0;
    const satuan = colIndex.satuan ? cellText(row.getCell(colIndex.satuan)) : "";
    const harga = colIndex.harga ? cellNumber(row.getCell(colIndex.harga)) : 0;

    // Nama menu & porsi boleh cuma diisi di baris pertama tiap grup (pola
    // umum spreadsheet manual) -- baris berikutnya mewarisi nilai terakhir.
    const itemName = itemNameCell || lastItemName;
    const porsi = itemNameCell ? porsiCell : lastPorsi || porsiCell;
    if (itemNameCell) {
      lastItemName = itemNameCell;
      lastPorsi = porsiCell;
    }

    if (!itemName || !bahan) {
      continue;
    }
    if (!(gramasi > 0) || !(porsi > 0)) {
      skippedRows++;
      continue;
    }
    parsed.push({ itemName, porsi, bahan, gramasi, satuan, harga });
  }

  if (parsed.length === 0) {
    return { error: "Tidak ada baris data valid yang terbaca dari file ini.", report: null };
  }

  const newIngredientNames: string[] = [];
  const stagingRows: {
    business_id: string;
    item_name: string;
    ingredient_id: string;
    qty_per_batch: number;
    unit: string;
    batch_yield: number;
    source_file: string;
  }[] = [];

  for (const row of parsed) {
    const key = norm(row.bahan);
    let ing = byName.get(key);
    if (!ing) {
      const { data: created, error: createErr } = await supabase
        .from("ingredients")
        .insert({
          business_id: businessId,
          name: row.bahan,
          unit: row.satuan || "pcs",
          unit_cost: row.harga || 0,
        })
        .select("id, name, unit")
        .single();
      if (createErr || !created) {
        return { error: `Gagal membuat bahan baku baru "${row.bahan}": ${createErr?.message}`, report: null };
      }
      ing = created;
      byName.set(key, created);
      newIngredientNames.push(row.bahan);
    }
    stagingRows.push({
      business_id: businessId,
      item_name: row.itemName,
      ingredient_id: ing.id,
      qty_per_batch: row.gramasi,
      unit: row.satuan || ing.unit,
      batch_yield: row.porsi,
      source_file: file.name,
    });
  }

  const itemNames = [...new Set(stagingRows.map((r) => r.item_name))];
  // Re-upload bersifat idempotent per nama item -- staging lama utk nama yg
  // sama dibuang dulu, biar tidak dobel kalau file yang sama diupload ulang.
  const { error: delErr } = await supabase
    .from("bsj_import_staging")
    .delete()
    .eq("business_id", businessId)
    .in("item_name", itemNames);
  if (delErr) return { error: delErr.message, report: null };

  const { error: insErr } = await supabase.from("bsj_import_staging").insert(stagingRows);
  if (insErr) return { error: insErr.message, report: null };

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    `Upload data Excel "${file.name}": ${itemNames.length} menu, ${stagingRows.length} baris bahan`,
  );

  revalidatePath(`/business/${businessId}/semi-finished-items/import`);
  return {
    error: null,
    report: {
      itemCount: itemNames.length,
      rowCount: stagingRows.length,
      newIngredients: newIngredientNames,
      skippedRows,
    },
  };
}
