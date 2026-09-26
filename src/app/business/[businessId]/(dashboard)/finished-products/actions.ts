"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type ActionState = { error: string | null };

export async function addFinishedProduct(
  businessId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = (formData.get("name") as string)?.trim();
  const category = (formData.get("category") as string)?.trim();
  const sellingPriceRaw = formData.get("sellingPrice") as string;
  const sellingPrice = sellingPriceRaw ? Number(sellingPriceRaw) : null;
  const fluctuationRaw = formData.get("fluctuationPct") as string;
  const fluctuationPct = fluctuationRaw ? Number(fluctuationRaw) : 0;
  const targetFoodCostRaw = formData.get("targetFoodCostPct") as string;
  const targetFoodCostPct = targetFoodCostRaw ? Number(targetFoodCostRaw) : null;

  if (!name) {
    return { error: "Nama produk jadi wajib diisi." };
  }
  if (sellingPrice !== null && !(sellingPrice >= 0)) {
    return { error: "Harga jual tidak valid." };
  }
  if (!(fluctuationPct >= 0) || fluctuationPct >= 100) {
    return { error: "Fluctuation % harus antara 0-99." };
  }
  if (targetFoodCostPct !== null && !(targetFoodCostPct > 0 && targetFoodCostPct <= 100)) {
    return { error: "Target food cost % harus antara 1-100." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("finished_products").insert({
    business_id: businessId,
    name,
    category: category || null,
    selling_price: sellingPrice,
    fluctuation_pct: fluctuationPct,
    target_food_cost_pct: targetFoodCostPct,
  });

  if (error) {
    return { error: error.message };
  }

  await logActivity(supabase, businessId, "produk", "sukses", `Produk jadi baru: ${name}`);
  revalidatePath(`/business/${businessId}/finished-products`);
  return { error: null };
}

export async function updateFinishedProduct(
  businessId: string,
  productId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = (formData.get("name") as string)?.trim();
  const category = (formData.get("category") as string)?.trim();
  const sellingPriceRaw = formData.get("sellingPrice") as string;
  const sellingPrice = sellingPriceRaw ? Number(sellingPriceRaw) : null;
  const fluctuationRaw = formData.get("fluctuationPct") as string;
  const fluctuationPct = fluctuationRaw ? Number(fluctuationRaw) : 0;
  const targetFoodCostRaw = formData.get("targetFoodCostPct") as string;
  const targetFoodCostPct = targetFoodCostRaw ? Number(targetFoodCostRaw) : null;

  if (!name) {
    return { error: "Nama produk jadi wajib diisi." };
  }
  if (sellingPrice !== null && !(sellingPrice >= 0)) {
    return { error: "Harga jual tidak valid." };
  }
  if (!(fluctuationPct >= 0) || fluctuationPct >= 100) {
    return { error: "Fluctuation % harus antara 0-99." };
  }
  if (targetFoodCostPct !== null && !(targetFoodCostPct > 0 && targetFoodCostPct <= 100)) {
    return { error: "Target food cost % harus antara 1-100." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("finished_products")
    .update({
      name,
      category: category || null,
      selling_price: sellingPrice,
      fluctuation_pct: fluctuationPct,
      target_food_cost_pct: targetFoodCostPct,
    })
    .eq("id", productId)
    .eq("business_id", businessId);

  if (error) {
    return { error: error.message };
  }

  await logActivity(supabase, businessId, "produk", "info", `Produk jadi diubah: ${name}`);
  revalidatePath(`/business/${businessId}/finished-products`);
  revalidatePath(`/business/${businessId}/finished-products/${productId}`);
  return { error: null };
}

export async function deleteFinishedProduct(businessId: string, productId: string) {
  const supabase = await createClient();

  const { data: product } = await supabase
    .from("finished_products")
    .select("name")
    .eq("id", productId)
    .eq("business_id", businessId)
    .maybeSingle();

  await supabase
    .from("finished_products")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", productId)
    .eq("business_id", businessId);

  if (product) {
    await logActivity(supabase, businessId, "produk", "warning", `Produk jadi dihapus: ${product.name}`);
  }
  revalidatePath(`/business/${businessId}/finished-products`);
}

export type BulkActionResult = { error?: string | null; skipped?: { name: string; reason: string }[] };

// finished_products selalu di ujung rantai BOM (tidak pernah jadi komponen
// resep apa pun, lihat migration finished_product_recipes) -- jadi beda dari
// bulk delete ingredients/BSJ, di sini tidak perlu pengecekan "masih dipakai".
export async function deleteFinishedProductsBulk(businessId: string, productIds: string[]): Promise<BulkActionResult> {
  if (productIds.length === 0) return { error: null };
  const supabase = await createClient();

  const { data: products } = await supabase
    .from("finished_products")
    .select("id, name")
    .eq("business_id", businessId)
    .in("id", productIds);

  const { error } = await supabase
    .from("finished_products")
    .update({ deleted_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .in("id", productIds);
  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "produk",
    "warning",
    `${productIds.length} produk jadi dihapus sekaligus`,
    (products ?? []).map((p) => p.name).join(", "),
  );

  revalidatePath(`/business/${businessId}/finished-products`);
  return { error: null };
}

export async function updateFinishedProductsCategoryBulk(
  businessId: string,
  productIds: string[],
  category: string,
): Promise<BulkActionResult> {
  if (productIds.length === 0) return { error: null };
  const supabase = await createClient();

  const { error } = await supabase
    .from("finished_products")
    .update({ category: category || null })
    .eq("business_id", businessId)
    .in("id", productIds);
  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/finished-products`);
  return { error: null };
}

export async function adjustFinishedProductsPriceBulk(
  businessId: string,
  productIds: string[],
  percent: number,
): Promise<BulkActionResult> {
  if (productIds.length === 0) return { error: null };
  if (Number.isNaN(percent)) return { error: "Persentase harus angka." };
  const supabase = await createClient();

  const { data: products, error: fetchError } = await supabase
    .from("finished_products")
    .select("id, name, selling_price")
    .eq("business_id", businessId)
    .in("id", productIds);
  if (fetchError) return { error: fetchError.message };

  const withPrice = (products ?? []).filter((p) => p.selling_price != null);
  const skipped = (products ?? [])
    .filter((p) => p.selling_price == null)
    .map((p) => ({ name: p.name, reason: "belum ada harga jual" }));

  for (const product of withPrice) {
    const newPrice = Math.max(0, Math.round(Number(product.selling_price) * (1 + percent / 100)));
    const { error } = await supabase.from("finished_products").update({ selling_price: newPrice }).eq("id", product.id);
    if (error) return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/finished-products`);
  return { error: null, skipped };
}

export type BulkComponentInput = {
  componentType: "ingredient" | "semi_finished";
  componentId: string;
  qty: number;
};

export type BulkAddState = { error: string | null; added?: number };

// Kumpulkan banyak baris dulu di client (lihat RecipeDropdownMultiAdd), baru
// satu round-trip buat semuanya -- ganti pola lama yang mengharuskan simpan
// satu bahan per submit. Tidak perlu deteksi siklus BOM di sini: finished
// product selalu di ujung rantai (tidak pernah jadi komponen resep lain).
export async function addRecipeComponentsBulk(
  businessId: string,
  finishedProductId: string,
  _prevState: BulkAddState,
  formData: FormData,
): Promise<BulkAddState> {
  const itemsRaw = formData.get("items") as string | null;
  if (!itemsRaw) return { error: "Tidak ada baris untuk ditambahkan." };

  let items: BulkComponentInput[];
  try {
    items = JSON.parse(itemsRaw);
  } catch {
    return { error: "Data tidak valid." };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { error: "Tidak ada baris untuk ditambahkan." };
  }

  const supabase = await createClient();

  const ingredientIds = items.filter((i) => i.componentType === "ingredient").map((i) => i.componentId);
  const semiIds = items.filter((i) => i.componentType === "semi_finished").map((i) => i.componentId);

  const [{ data: ingredientRows }, { data: semiRows }] = await Promise.all([
    ingredientIds.length > 0
      ? supabase.from("ingredients").select("id, unit").eq("business_id", businessId).in("id", ingredientIds)
      : Promise.resolve({ data: [] as { id: string; unit: string }[] }),
    semiIds.length > 0
      ? supabase.from("semi_finished_items").select("id, unit").eq("business_id", businessId).in("id", semiIds)
      : Promise.resolve({ data: [] as { id: string; unit: string }[] }),
  ]);
  const unitById = new Map<string, string>();
  for (const r of ingredientRows ?? []) unitById.set(r.id, r.unit);
  for (const r of semiRows ?? []) unitById.set(r.id, r.unit);

  const rows = items
    .filter((item) => unitById.has(item.componentId) && item.qty > 0)
    .map((item) => ({
      business_id: businessId,
      finished_product_id: finishedProductId,
      component_type: item.componentType,
      ingredient_id: item.componentType === "ingredient" ? item.componentId : null,
      semi_finished_item_id: item.componentType === "semi_finished" ? item.componentId : null,
      qty: item.qty,
      unit: unitById.get(item.componentId)!,
    }));

  if (rows.length === 0) {
    return { error: "Tidak ada baris valid untuk ditambahkan." };
  }

  const { error } = await supabase.from("finished_product_recipes").insert(rows);
  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/finished-products/${finishedProductId}`);
  revalidatePath(`/business/${businessId}/finished-products`);
  return { error: null, added: rows.length };
}

export async function removeRecipeComponent(businessId: string, finishedProductId: string, recipeRowId: string) {
  const supabase = await createClient();
  await supabase
    .from("finished_product_recipes")
    .delete()
    .eq("id", recipeRowId)
    .eq("business_id", businessId);

  revalidatePath(`/business/${businessId}/finished-products/${finishedProductId}`);
  revalidatePath(`/business/${businessId}/finished-products`);
}
