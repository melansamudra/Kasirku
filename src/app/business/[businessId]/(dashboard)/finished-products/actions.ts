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

  if (!name) {
    return { error: "Nama produk jadi wajib diisi." };
  }
  if (sellingPrice !== null && !(sellingPrice >= 0)) {
    return { error: "Harga jual tidak valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("finished_products").insert({
    business_id: businessId,
    name,
    category: category || null,
    selling_price: sellingPrice,
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

  if (!name) {
    return { error: "Nama produk jadi wajib diisi." };
  }
  if (sellingPrice !== null && !(sellingPrice >= 0)) {
    return { error: "Harga jual tidak valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("finished_products")
    .update({ name, category: category || null, selling_price: sellingPrice })
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

export async function addRecipeComponent(
  businessId: string,
  finishedProductId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const componentValue = (formData.get("component") as string) ?? "";
  const qtyRaw = formData.get("qty") as string;
  const qty = Number(qtyRaw);

  const [componentType, componentId] = componentValue.split(":");
  if ((componentType !== "ingredient" && componentType !== "semi_finished") || !componentId) {
    return { error: "Pilih komponen resep." };
  }
  if (!(qty > 0)) {
    return { error: "Jumlah harus lebih dari 0." };
  }

  const supabase = await createClient();
  const table = componentType === "ingredient" ? "ingredients" : "semi_finished_items";
  const { data: component } = await supabase
    .from(table)
    .select("unit")
    .eq("id", componentId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!component) {
    return { error: "Komponen tidak ditemukan." };
  }

  const { error } = await supabase.from("finished_product_recipes").insert({
    business_id: businessId,
    finished_product_id: finishedProductId,
    component_type: componentType,
    ingredient_id: componentType === "ingredient" ? componentId : null,
    semi_finished_item_id: componentType === "semi_finished" ? componentId : null,
    qty,
    unit: component.unit,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/finished-products/${finishedProductId}`);
  revalidatePath(`/business/${businessId}/finished-products`);
  return { error: null };
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
