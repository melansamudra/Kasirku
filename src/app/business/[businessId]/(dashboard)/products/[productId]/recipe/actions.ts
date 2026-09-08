"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recalculateProductCost } from "@/lib/recalculate-product-cost";

export type BatchRecipeState = { error: string | null; savedCount: number };

// Tambah banyak bahan sekaligus dalam satu submit -- dipakai form multi-baris
// di add-recipe-form.tsx supaya user tidak perlu simpan satu-satu per bahan.
export async function addRecipeItems(
  businessId: string,
  productId: string,
  items: { ingredientId: string; qty: number }[],
): Promise<BatchRecipeState> {
  const valid = items.filter((it) => it.ingredientId && it.qty > 0);
  if (valid.length === 0) {
    return { error: "Tambahkan minimal satu bahan dengan jumlah lebih dari 0.", savedCount: 0 };
  }

  const supabase = await createClient();

  const ingredientIds = [...new Set(valid.map((it) => it.ingredientId))];
  const { data: ingredientRows } = await supabase
    .from("ingredients")
    .select("id, unit")
    .in("id", ingredientIds);
  const unitById = new Map((ingredientRows ?? []).map((i) => [i.id, i.unit]));

  const rows = valid
    .filter((it) => unitById.has(it.ingredientId))
    .map((it) => ({
      product_id: productId,
      ingredient_id: it.ingredientId,
      qty: it.qty,
      unit: unitById.get(it.ingredientId)!,
    }));

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
