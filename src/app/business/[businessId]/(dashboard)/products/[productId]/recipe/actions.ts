"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function recalculateProductCost(supabase: SupabaseServerClient, productId: string) {
  const { data: items } = await supabase
    .from("product_recipes")
    .select("qty, ingredients(unit_cost)")
    .eq("product_id", productId);

  const totalCost = (items ?? []).reduce((sum, item) => {
    const ingredient = item.ingredients as unknown as { unit_cost: number } | null;
    return sum + Number(ingredient?.unit_cost ?? 0) * Number(item.qty);
  }, 0);

  await supabase.from("products").update({ cost: totalCost }).eq("id", productId);
}

export type RecipeState = { error: string | null };

export async function addRecipeItem(
  businessId: string,
  productId: string,
  _prevState: RecipeState,
  formData: FormData,
): Promise<RecipeState> {
  const ingredientId = formData.get("ingredientId") as string;
  const qtyRaw = formData.get("qty") as string;
  const qty = Number(qtyRaw);

  if (!ingredientId) {
    return { error: "Pilih bahan baku dulu." };
  }
  if (!qtyRaw || Number.isNaN(qty) || qty <= 0) {
    return { error: "Jumlah harus angka lebih dari 0." };
  }

  const supabase = await createClient();

  const { data: ingredient } = await supabase
    .from("ingredients")
    .select("unit")
    .eq("id", ingredientId)
    .single();

  if (!ingredient) {
    return { error: "Bahan baku tidak ditemukan." };
  }

  const { error: insertError } = await supabase.from("product_recipes").insert({
    product_id: productId,
    ingredient_id: ingredientId,
    qty,
    unit: ingredient.unit,
  });

  if (insertError) {
    return { error: insertError.message };
  }

  await recalculateProductCost(supabase, productId);

  revalidatePath(`/business/${businessId}/products/${productId}/recipe`);
  return { error: null };
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
