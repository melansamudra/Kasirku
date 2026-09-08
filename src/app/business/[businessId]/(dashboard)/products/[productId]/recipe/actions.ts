"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recalculateProductCost } from "@/lib/recalculate-product-cost";

export type BatchRecipeState = { error: string | null; savedCount: number };

export type BatchRecipeItemInput =
  | { kind: "existing"; ingredientId: string; qty: number }
  | { kind: "new"; name: string; unit: string; unitCost: number; qty: number };

// Tambah banyak bahan sekaligus dalam satu submit -- dipakai form multi-baris
// di add-recipe-form.tsx supaya user tidak perlu simpan satu-satu per bahan.
// Baris "new" (bahan belum ada di Bahan Baku) dibuatkan ingredient-nya dulu di
// sini juga, biar user tidak perlu pindah halaman -- sama seperti addIngredient
// di ingredients/actions.ts tapi versi ringkas (tanpa barcode) karena dipakai
// di tengah alur susun resep.
export async function addRecipeItems(
  businessId: string,
  productId: string,
  items: BatchRecipeItemInput[],
): Promise<BatchRecipeState> {
  const valid = items.filter((it) => it.qty > 0 && (it.kind === "existing" ? it.ingredientId : it.name.trim() && it.unit.trim()));
  if (valid.length === 0) {
    return { error: "Tambahkan minimal satu bahan dengan jumlah lebih dari 0.", savedCount: 0 };
  }

  const supabase = await createClient();

  // Dedup bahan baru dgn nama sama dalam satu submit yg sama, biar tidak
  // kebuat 2x kalau user isi baris "bahan baru" dgn nama identik.
  const newIngredientIdByName = new Map<string, string>();
  for (const it of valid) {
    if (it.kind !== "new") continue;
    const key = it.name.trim().toLowerCase();
    if (newIngredientIdByName.has(key)) continue;
    const unitCost = Number.isNaN(it.unitCost) || it.unitCost < 0 ? 0 : it.unitCost;
    const { data: inserted, error: createError } = await supabase
      .from("ingredients")
      .insert({ business_id: businessId, name: it.name.trim(), unit: it.unit.trim(), unit_cost: unitCost, stock: 0 })
      .select("id")
      .single();
    if (createError || !inserted) {
      return { error: createError?.message ?? `Gagal membuat bahan "${it.name}".`, savedCount: 0 };
    }
    await supabase.from("ingredient_price_history").insert({
      business_id: businessId,
      ingredient_id: inserted.id,
      unit_cost: unitCost,
      source: "awal",
    });
    newIngredientIdByName.set(key, inserted.id);
  }

  const existingIds = [...new Set(valid.filter((it) => it.kind === "existing").map((it) => (it as { ingredientId: string }).ingredientId))];
  const { data: ingredientRows } = existingIds.length
    ? await supabase.from("ingredients").select("id, unit").in("id", existingIds)
    : { data: [] };
  const unitById = new Map((ingredientRows ?? []).map((i) => [i.id, i.unit]));

  const rows: { product_id: string; ingredient_id: string; qty: number; unit: string }[] = [];
  for (const it of valid) {
    if (it.kind === "existing") {
      const unit = unitById.get(it.ingredientId);
      if (!unit) continue;
      rows.push({ product_id: productId, ingredient_id: it.ingredientId, qty: it.qty, unit });
    } else {
      const ingredientId = newIngredientIdByName.get(it.name.trim().toLowerCase());
      if (!ingredientId) continue;
      rows.push({ product_id: productId, ingredient_id: ingredientId, qty: it.qty, unit: it.unit.trim() });
    }
  }

  if (rows.length === 0) {
    return { error: "Bahan baku tidak ditemukan.", savedCount: 0 };
  }

  const { error: insertError } = await supabase.from("product_recipes").insert(rows);
  if (insertError) {
    return { error: insertError.message, savedCount: 0 };
  }

  await recalculateProductCost(supabase, productId);

  revalidatePath(`/business/${businessId}/products/${productId}/recipe`);
  return { error: null, savedCount: rows.length };
}

export async function removeRecipeItem(
  businessId: string,
  productId: string,
  recipeItemId: string,
) {
  const supabase = await createClient();
  await supabase.from("product_recipes").delete().eq("id", recipeItemId);
  await recalculateProductCost(supabase, productId);
  revalidatePath(`/business/${businessId}/products/${productId}/recipe`);
}

export type UpdateQtyResult = { error: string | null };

// Ubah jumlah bahan di satu baris resep yang sudah tersimpan, tanpa perlu
// hapus lalu tambah ulang bahannya.
export async function updateRecipeItemQty(
  businessId: string,
  productId: string,
  recipeItemId: string,
  qty: number,
): Promise<UpdateQtyResult> {
  if (!qty || Number.isNaN(qty) || qty <= 0) {
    return { error: "Jumlah harus angka lebih dari 0." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("product_recipes")
    .update({ qty })
    .eq("id", recipeItemId)
    .eq("product_id", productId);

  if (error) {
    return { error: error.message };
  }

  await recalculateProductCost(supabase, productId);
  revalidatePath(`/business/${businessId}/products/${productId}/recipe`);
  return { error: null };
}
