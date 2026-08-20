"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { parseCsv } from "@/lib/csv";
import { recalculateProductCostsForIngredient } from "@/lib/recalculate-product-cost";
import ExcelJS from "exceljs";

// Pengelompokan bahan per departemen (dapur/bar/front) — biar admin yang
// scan/lihat order Permintaan Barang langsung tahu ini buat departemen mana.
export async function updateIngredientDepartment(
  businessId: string,
  ingredientId: string,
  department: string,
): Promise<{ error: string | null }> {
  if (department && !["dapur", "bar", "front"].includes(department)) {
    return { error: "Departemen tidak valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ingredients")
    .update({ department: department || null })
    .eq("id", ingredientId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/ingredients`);
  return { error: null };
}

export type AddIngredientState = { error: string | null };

export async function addIngredient(
  businessId: string,
  _prevState: AddIngredientState,
  formData: FormData,
): Promise<AddIngredientState> {
  const name = (formData.get("name") as string)?.trim();
  const unit = (formData.get("unit") as string)?.trim();
  const unitCostRaw = formData.get("unitCost") as string;
  const stockRaw = formData.get("stock") as string;
  const minStockRaw = formData.get("minStock") as string;

  if (!name) {
    return { error: "Nama bahan wajib diisi." };
  }
  if (!unit) {
    return { error: "Satuan wajib diisi (mis. gr, ml, pcs)." };
  }

  const unitCost = unitCostRaw ? Number(unitCostRaw) : 0;
  if (Number.isNaN(unitCost) || unitCost < 0) {
    return { error: "Harga per satuan harus angka dan tidak boleh negatif." };
  }

  const stock = stockRaw ? Number(stockRaw) : 0;
  if (Number.isNaN(stock) || stock < 0) {
    return { error: "Stok harus angka dan tidak boleh negatif." };
  }

  const minStock = minStockRaw ? Number(minStockRaw) : 0;
  if (Number.isNaN(minStock) || minStock < 0) {
    return { error: "Stok minimum harus angka dan tidak boleh negatif." };
  }

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("ingredients")
    .insert({
      business_id: businessId,
      name,
      unit,
      unit_cost: unitCost,
      stock,
      min_stock: minStock,
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  await supabase.from("ingredient_price_history").insert({
    business_id: businessId,
    ingredient_id: inserted.id,
    unit_cost: unitCost,
    source: "awal",
  });

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    `Bahan baku baru: ${name}`,
    `Stok ${stock} ${unit}`,
  );
  revalidatePath(`/business/${businessId}/ingredients`);
  return { error: null };
}

export type EditIngredientState = { error: string | null };

export async function editIngredient(
  businessId: string,
  ingredientId: string,
  _prevState: EditIngredientState,
  formData: FormData,
): Promise<EditIngredientState> {
  const name = (formData.get("name") as string)?.trim();
  const unit = (formData.get("unit") as string)?.trim();
  const unitCostRaw = formData.get("unitCost") as string;
  const minStockRaw = formData.get("minStock") as string;

  if (!name) {
    return { error: "Nama bahan wajib diisi." };
  }
  if (!unit) {
    return { error: "Satuan wajib diisi (mis. gr, ml, pcs)." };
  }

  const unitCost = unitCostRaw ? Number(unitCostRaw) : 0;
  if (Number.isNaN(unitCost) || unitCost < 0) {
    return { error: "Harga per satuan harus angka dan tidak boleh negatif." };
  }

  const minStock = minStockRaw ? Number(minStockRaw) : 0;
  if (Number.isNaN(minStock) || minStock < 0) {
    return { error: "Stok minimum harus angka dan tidak boleh negatif." };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("ingredients")
    .select("unit_cost")
    .eq("id", ingredientId)
    .eq("business_id", businessId)
    .maybeSingle();

  const { error } = await supabase
    .from("ingredients")
    .update({
      name,
      unit,
      unit_cost: unitCost,
      min_stock: minStock,
    })
    .eq("id", ingredientId)
    .eq("business_id", businessId);

  if (error) {
    return { error: error.message };
  }

  if (existing && Number(existing.unit_cost) !== unitCost) {
    await supabase.from("ingredient_price_history").insert({
      business_id: businessId,
      ingredient_id: ingredientId,
      unit_cost: unitCost,
      source: "manual",
    });
    await recalculateProductCostsForIngredient(supabase, ingredientId);
  }

  await logActivity(supabase, businessId, "produk", "info", `Bahan baku diubah: ${name}`);
  revalidatePath(`/business/${businessId}/ingredients`);
  return { error: null };
}

export type AdjustStockResult = { error: string | null };

export async function adjustIngredientStock(
  businessId: string,
  ingredientId: string,
  newStock: number,
  reason: string,
): Promise<AdjustStockResult> {
  if (Number.isNaN(newStock) || newStock < 0) {
    return { error: "Stok fisik harus angka dan tidak boleh negatif." };
  }
  reason = reason.trim();
  if (!reason) {
    return { error: "Alasan penyesuaian wajib diisi." };
  }

  const supabase = await createClient();

  const { data: ingredient } = await supabase
    .from("ingredients")
    .select("id, name, unit, stock")
    .eq("id", ingredientId)
    .eq("business_id", businessId)
    .single();

  if (!ingredient) {
    return { error: "Bahan baku tidak ditemukan." };
  }

  const stockBefore = Number(ingredient.stock);
  const diff = newStock - stockBefore;

  if (diff === 0) {
    return { error: "Stok fisik sama dengan stok sistem, tidak ada yang disesuaikan." };
  }

  const { error: updateError } = await supabase
    .from("ingredients")
    .update({ stock: newStock })
    .eq("id", ingredientId);

  if (updateError) {
    return { error: updateError.message };
  }

  await supabase.from("stock_adjustments").insert({
    business_id: businessId,
    ingredient_id: ingredientId,
    item_name: ingredient.name,
    unit: ingredient.unit,
    stock_before: stockBefore,
    stock_after: newStock,
    diff,
    reason,
  });

  await logActivity(
    supabase,
    businessId,
    "produk",
    "warning",
    `Penyesuaian stok: ${ingredient.name}`,
    `${stockBefore} → ${newStock} ${ingredient.unit} (${diff > 0 ? "+" : ""}${diff}) · ${reason}`,
  );
  revalidatePath(`/business/${businessId}/ingredients`);
  return { error: null };
}

export async function deleteIngredient(businessId: string, ingredientId: string) {
  const supabase = await createClient();

  const { data: ingredient } = await supabase
    .from("ingredients")
    .select("name")
    .eq("id", ingredientId)
    .eq("business_id", businessId)
    .maybeSingle();

  await supabase
    .from("ingredients")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", ingredientId)
    .eq("business_id", businessId);

  if (ingredient) {
    await logActivity(
      supabase,
      businessId,
      "produk",
      "warning",
      `Bahan baku dihapus: ${ingredient.name}`,
    );
  }
  revalidatePath(`/business/${businessId}/ingredients`);
}

export type PurchaseUnitState = { error: string | null };

// Satu bahan bisa punya beberapa varian satuan beli (mis. "Sak Kecil" = 5kg,
// "Sak Besar" = 25kg) — dipakai sebagai pilihan satuan saat catat pembelian
// resmi (bukan saat order barang, yang qty/satuannya disimpan apa adanya).
export async function addIngredientPurchaseUnit(
  businessId: string,
  ingredientId: string,
  _prevState: PurchaseUnitState,
  formData: FormData,
): Promise<PurchaseUnitState> {
  const unitName = (formData.get("unitName") as string)?.trim();
  const conversionRaw = formData.get("conversion") as string;

  if (!unitName) {
    return { error: "Nama satuan beli wajib diisi." };
  }

  const conversion = Number(conversionRaw);
  if (!conversionRaw || Number.isNaN(conversion) || conversion <= 0) {
    return { error: "Isi berapa satuan stok per 1 satuan beli ini." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("ingredient_purchase_units").upsert(
    { business_id: businessId, ingredient_id: ingredientId, unit_name: unitName, conversion },
    { onConflict: "ingredient_id,unit_name" },
  );

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/ingredients`);
  return { error: null };
}

export async function deleteIngredientPurchaseUnit(
  businessId: string,
  unitId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ingredient_purchase_units")
    .delete()
    .eq("id", unitId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/ingredients`);
  return { error: null };
}

export type ImportIngredientsState = {
  error: string | null;
  result: { created: number; updated: number; skipped: number; errors: string[] } | null;
};

// Matches export/route.ts's column order exactly, so a downloaded-then-
// re-uploaded file round-trips without edits. Ingredients have no
// SKU/barcode like products do, so existing rows are matched by name.
const IMPORT_COLUMNS = ["name", "unit", "unitCost", "stock", "minStock"] as const;

async function parseFileToRows(file: File): Promise<string[][] | { error: string }> {
  const isXlsx = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

  if (isXlsx) {
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return { error: "File Excel tidak memiliki sheet." };

    const rows: string[][] = [];
    sheet.eachRow((row) => {
      rows.push(
        (row.values as (ExcelJS.CellValue | null)[])
          .slice(1)
          .map((v) => (v == null ? "" : String(v instanceof Object && "text" in v ? (v as { text: string }).text : v))),
      );
    });
    return rows;
  }

  const text = await file.text();
  return parseCsv(text);
}

export async function importIngredients(
  businessId: string,
  _prevState: ImportIngredientsState,
  formData: FormData,
): Promise<ImportIngredientsState> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { error: "Pilih file dulu.", result: null };
  }

  const parsed = await parseFileToRows(file);
  if ("error" in parsed) return { error: parsed.error, result: null };

  const rows = parsed.filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length < 2) {
    return { error: "File kosong atau cuma berisi header.", result: null };
  }

  const dataRows = rows.slice(1);
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("ingredients")
    .select("id, name, unit_cost")
    .eq("business_id", businessId)
    .is("deleted_at", null);

  const byName = new Map((existing ?? []).map((i) => [i.name.trim().toLowerCase(), i]));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const line = i + 2; // +1 for header, +1 for 1-indexing
    const get = (col: (typeof IMPORT_COLUMNS)[number]) =>
      row[IMPORT_COLUMNS.indexOf(col)]?.trim() || "";

    const name = get("name");
    if (!name) {
      skipped++;
      errors.push(`Baris ${line}: nama bahan kosong`);
      continue;
    }
    const unit = get("unit");
    if (!unit) {
      skipped++;
      errors.push(`Baris ${line}: satuan kosong`);
      continue;
    }
    const unitCost = Number(get("unitCost"));
    if (get("unitCost") === "" || Number.isNaN(unitCost) || unitCost < 0) {
      skipped++;
      errors.push(`Baris ${line}: harga per satuan tidak valid`);
      continue;
    }
    const stock = Number(get("stock")) || 0;
    const minStock = Number(get("minStock")) || 0;

    const match = byName.get(name.toLowerCase());

    if (match) {
      const { error } = await supabase
        .from("ingredients")
        .update({ name, unit, unit_cost: unitCost, stock, min_stock: minStock })
        .eq("id", match.id)
        .eq("business_id", businessId);

      if (error) {
        skipped++;
        errors.push(`Baris ${line}: ${error.message}`);
        continue;
      }

      if (Number(match.unit_cost) !== unitCost) {
        await supabase.from("ingredient_price_history").insert({
          business_id: businessId,
          ingredient_id: match.id,
          unit_cost: unitCost,
          source: "impor",
        });
        await recalculateProductCostsForIngredient(supabase, match.id);
      }
      updated++;
    } else {
      const { data: inserted, error } = await supabase
        .from("ingredients")
        .insert({ business_id: businessId, name, unit, unit_cost: unitCost, stock, min_stock: minStock })
        .select("id")
        .single();

      if (error || !inserted) {
        skipped++;
        errors.push(`Baris ${line}: ${error?.message ?? "gagal menambahkan"}`);
        continue;
      }

      await supabase.from("ingredient_price_history").insert({
        business_id: businessId,
        ingredient_id: inserted.id,
        unit_cost: unitCost,
        source: "impor",
      });
      created++;
    }
  }

  await logActivity(
    supabase,
    businessId,
    "produk",
    skipped > 0 ? "warning" : "sukses",
    `Impor bahan baku: ${created} baru, ${updated} diperbarui, ${skipped} dilewati`,
  );
  revalidatePath(`/business/${businessId}/ingredients`);
  return { error: null, result: { created, updated, skipped, errors: errors.slice(0, 20) } };
}
