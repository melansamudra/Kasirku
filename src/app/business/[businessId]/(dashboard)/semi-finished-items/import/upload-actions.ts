"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { logActivity } from "@/lib/activity-log";

// Format tetap (lihat /template-resep-bsj): kolom A-F = Nama Menu, Porsi,
// Nama Bahan, Qty, Satuan, Harga. Nama Menu & Porsi diulang di tiap baris
// (bukan cuma baris pertama) -- lebih mudah divalidasi & tidak ambigu
// dibanding pola "carry forward" ala Excel manual.
const EXPECTED_HEADERS = ["nama menu", "porsi", "nama bahan", "qty", "satuan", "harga"];

export type ParsedRow = { rowNum: number; itemName: string; porsi: number; bahan: string; qty: number; satuan: string; harga: number };

export type MatchCandidate = { id: string; name: string };
export type BahanResolution = {
  bahan: string; // nama asli (casing pertama muncul)
  status: "matched" | "similar" | "new";
  matchedId: string | null;
  candidates: MatchCandidate[];
  suggestedUnit: string;
  suggestedPrice: number;
};

export type ParseState = {
  error: string | null;
  fileName: string | null;
  rows: ParsedRow[] | null;
  resolutions: BahanResolution[] | null;
  skipped: { rowNum: number; reason: string }[];
};

const initialParseState: ParseState = { error: null, fileName: null, rows: null, resolutions: null, skipped: [] };

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

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export async function parseDataglobalExcel(
  businessId: string,
  _prevState: ParseState,
  formData: FormData,
): Promise<ParseState> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { ...initialParseState, error: "Pilih file Excel dulu." };
  }

  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    return { ...initialParseState, error: "File tidak bisa dibaca sebagai Excel (.xlsx)." };
  }

  const ws = wb.worksheets[0];
  if (!ws) {
    return { ...initialParseState, error: "Tidak ada sheet di file ini." };
  }

  const headerCells = EXPECTED_HEADERS.map((_, i) => norm(cellText(ws.getRow(1).getCell(i + 1))));
  const headerOk = EXPECTED_HEADERS.every((h, i) => headerCells[i] === h);
  if (!headerOk) {
    return {
      ...initialParseState,
      error: `Format kolom tidak sesuai template. Baris 1 harus persis: ${EXPECTED_HEADERS.map((h) => h[0].toUpperCase() + h.slice(1)).join(", ")}. Download template dulu kalau perlu.`,
    };
  }

  const parsed: ParsedRow[] = [];
  const skipped: { rowNum: number; reason: string }[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const itemName = cellText(row.getCell(1));
    const porsi = cellNumber(row.getCell(2));
    const bahan = cellText(row.getCell(3));
    const qty = cellNumber(row.getCell(4));
    const satuan = cellText(row.getCell(5));
    const harga = cellNumber(row.getCell(6));

    if (!itemName && !bahan) continue; // baris kosong, dilewati diam-diam
    if (!itemName) {
      skipped.push({ rowNum: r, reason: "Nama Menu kosong" });
      continue;
    }
    if (!bahan) {
      skipped.push({ rowNum: r, reason: "Nama Bahan kosong" });
      continue;
    }
    if (!(porsi > 0)) {
      skipped.push({ rowNum: r, reason: "Porsi harus lebih dari 0" });
      continue;
    }
    if (!(qty > 0)) {
      skipped.push({ rowNum: r, reason: "Qty harus lebih dari 0" });
      continue;
    }
    parsed.push({ rowNum: r, itemName, porsi, bahan, qty, satuan, harga });
  }

  if (parsed.length === 0) {
    return { ...initialParseState, error: "Tidak ada baris data valid yang terbaca dari file ini.", skipped };
  }

  const supabase = await createClient();
  const ingredientList = await fetchAllRows((from, to) =>
    supabase.from("ingredients").select("id, name").eq("business_id", businessId).is("deleted_at", null).range(from, to),
  );

  const seenBahan = new Map<string, { bahan: string; satuan: string; harga: number }>();
  for (const row of parsed) {
    const key = norm(row.bahan);
    if (!seenBahan.has(key)) seenBahan.set(key, { bahan: row.bahan, satuan: row.satuan, harga: row.harga });
  }

  const resolutions: BahanResolution[] = [];
  for (const [key, info] of seenBahan) {
    const exact = ingredientList.find((i) => norm(i.name) === key);
    if (exact) {
      resolutions.push({
        bahan: info.bahan,
        status: "matched",
        matchedId: exact.id,
        candidates: [{ id: exact.id, name: exact.name }],
        suggestedUnit: info.satuan,
        suggestedPrice: info.harga,
      });
      continue;
    }
    const candidates = ingredientList
      .filter((i) => {
        const n = norm(i.name);
        return n.includes(key) || key.includes(n) || levenshtein(n, key) <= 2;
      })
      .slice(0, 5)
      .map((i) => ({ id: i.id, name: i.name }));
    resolutions.push({
      bahan: info.bahan,
      status: candidates.length > 0 ? "similar" : "new",
      matchedId: null,
      candidates,
      suggestedUnit: info.satuan || "pcs",
      suggestedPrice: info.harga || 0,
    });
  }
  resolutions.sort((a, b) => {
    const order = { new: 0, similar: 1, matched: 2 };
    return order[a.status] - order[b.status] || a.bahan.localeCompare(b.bahan);
  });

  return { error: null, fileName: file.name, rows: parsed, resolutions, skipped };
}

export type BahanDecision =
  | { bahan: string; action: "existing"; ingredientId: string }
  | { bahan: string; action: "new"; name: string; unit: string; price: number };

export type ConfirmState = {
  error: string | null;
  report: { itemCount: number; rowCount: number; newIngredients: string[] } | null;
};

export async function confirmDataglobalImport(
  businessId: string,
  _prevState: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const rowsRaw = formData.get("rows") as string | null;
  const decisionsRaw = formData.get("decisions") as string | null;
  const fileName = (formData.get("fileName") as string) || "upload.xlsx";
  if (!rowsRaw || !decisionsRaw) {
    return { error: "Data tidak lengkap, silakan upload ulang.", report: null };
  }

  let rows: ParsedRow[];
  let decisions: BahanDecision[];
  try {
    rows = JSON.parse(rowsRaw);
    decisions = JSON.parse(decisionsRaw);
  } catch {
    return { error: "Data tidak valid, silakan upload ulang.", report: null };
  }

  const supabase = await createClient();
  const bahanToIngredientId = new Map<string, string>();
  const newIngredientNames: string[] = [];

  for (const d of decisions) {
    const key = norm(d.bahan);
    if (d.action === "existing") {
      bahanToIngredientId.set(key, d.ingredientId);
    } else {
      const { data: created, error: createErr } = await supabase
        .from("ingredients")
        .insert({ business_id: businessId, name: d.name, unit: d.unit || "pcs", unit_cost: d.price || 0 })
        .select("id")
        .single();
      if (createErr || !created) {
        return { error: `Gagal membuat bahan baku baru "${d.name}": ${createErr?.message}`, report: null };
      }
      bahanToIngredientId.set(key, created.id);
      newIngredientNames.push(d.name);
    }
  }

  const stagingRows: {
    business_id: string;
    item_name: string;
    ingredient_id: string;
    qty_per_batch: number;
    unit: string;
    batch_yield: number;
    source_file: string;
  }[] = [];
  for (const row of rows) {
    const ingredientId = bahanToIngredientId.get(norm(row.bahan));
    if (!ingredientId) continue; // seharusnya tidak terjadi kalau semua bahan sudah diputuskan
    stagingRows.push({
      business_id: businessId,
      item_name: row.itemName,
      ingredient_id: ingredientId,
      qty_per_batch: row.qty,
      unit: row.satuan || "pcs",
      batch_yield: row.porsi,
      source_file: fileName,
    });
  }

  if (stagingRows.length === 0) {
    return { error: "Tidak ada baris yang bisa disimpan.", report: null };
  }

  const itemNames = [...new Set(stagingRows.map((r) => r.item_name))];
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
    `Upload data Excel "${fileName}": ${itemNames.length} menu, ${stagingRows.length} baris bahan (${newIngredientNames.length} bahan baku baru)`,
  );

  revalidatePath(`/business/${businessId}/semi-finished-items/import`);
  return {
    error: null,
    report: { itemCount: itemNames.length, rowCount: stagingRows.length, newIngredients: newIngredientNames },
  };
}
