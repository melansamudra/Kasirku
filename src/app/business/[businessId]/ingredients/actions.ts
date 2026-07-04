"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

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
  const { error } = await supabase.from("ingredients").insert({
    business_id: businessId,
    name,
    unit,
    unit_cost: unitCost,
    stock,
    min_stock: minStock,
  });

  if (error) {
    return { error: error.message };
  }

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
  const { error } = await supabase
    .from("ingredients")
    .update({ name, unit, unit_cost: unitCost, min_stock: minStock })
    .eq("id", ingredientId)
    .eq("business_id", businessId);

  if (error) {
    return { error: error.message };
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
