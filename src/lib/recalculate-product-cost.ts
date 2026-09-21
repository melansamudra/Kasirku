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

  const { error } = await supabase.from("products").update({ cost: totalCost }).eq("id", productId);
  if (error) {
    console.error(`recalculateProductCost gagal untuk product ${productId}:`, error);
  }
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
  await recalculateProductCosts(supabase, productIds);
}

// Versi batch dari recalculateProductCost — bahan baku dasar (gula, kopi,
// dst) bisa dipakai di puluhan produk sekaligus. Dulu ini loop per-produk
// (2 round-trip serial × N produk); sekarang 1 query + 1 upsert utk semua
// produk yang terdampak.
export async function recalculateProductCosts(
  supabase: SupabaseServerClient,
  productIds: string[],
) {
  if (productIds.length === 0) return;

  const { data: items } = await supabase
    .from("product_recipes")
    .select("product_id, qty, ingredients(unit_cost)")
    .in("product_id", productIds);

  const totals = new Map<string, number>(productIds.map((id) => [id, 0]));
  for (const item of items ?? []) {
    const ingredient = item.ingredients as unknown as { unit_cost: number } | null;
    const cost = Number(ingredient?.unit_cost ?? 0) * Number(item.qty);
    totals.set(item.product_id, (totals.get(item.product_id) ?? 0) + cost);
  }

  // update (bukan upsert) -- products.business_id/name NOT NULL tanpa
  // default, upsert akan minta kolom itu juga padahal produknya sudah ada.
  // Tetap 1 wave paralel, bukan serial seperti versi sebelumnya.
  const results = await Promise.all(
    productIds.map((id) =>
      supabase.from("products").update({ cost: totals.get(id) ?? 0 }).eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error(`recalculateProductCosts gagal untuk ${productIds.length} produk:`, failed.error);
  }
}
