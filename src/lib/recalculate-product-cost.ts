import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function recalculateProductCost(supabase: SupabaseServerClient, productId: string) {
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

// Bahan baku dipakai di banyak resep produk — dipanggil setiap kali
// unit_cost sebuah bahan berubah (edit manual, pembelian lewat Catat
// Pengeluaran, atau Pembelian formal) supaya products.cost tidak basi.
export async function recalculateProductCostsForIngredient(
  supabase: SupabaseServerClient,
  ingredientId: string,
) {
  const { data: recipes } = await supabase
    .from("product_recipes")
    .select("product_id")
    .eq("ingredient_id", ingredientId);

  const productIds = Array.from(new Set((recipes ?? []).map((r) => r.product_id)));
  for (const productId of productIds) {
    await recalculateProductCost(supabase, productId);
  }
}
