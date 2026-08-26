"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { wouldCreateCycle } from "@/lib/cost-control/compute-cost";

export type ActionState = { error: string | null };

export async function addSemiFinishedItem(
  businessId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = (formData.get("name") as string)?.trim();
  const unit = (formData.get("unit") as string)?.trim();
  const minStockRaw = formData.get("minStock") as string;
  const minStock = minStockRaw ? Number(minStockRaw) : 0;
  const fluctuationRaw = formData.get("fluctuationPct") as string;
  const fluctuationPct = fluctuationRaw ? Number(fluctuationRaw) : 0;

  if (!name || !unit) {
    return { error: "Nama dan satuan wajib diisi." };
  }
  if (!(minStock >= 0)) {
    return { error: "Stok minimum tidak valid." };
  }
  if (!(fluctuationPct >= 0) || fluctuationPct >= 100) {
    return { error: "Fluctuation % harus antara 0-99." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("semi_finished_items").insert({
    business_id: businessId,
    name,
    unit,
    min_stock: minStock,
    fluctuation_pct: fluctuationPct,
  });

  if (error) {
    return { error: error.message };
  }

  await logActivity(supabase, businessId, "produk", "sukses", `Bahan setengah jadi baru: ${name}`);
  revalidatePath(`/business/${businessId}/semi-finished-items`);
  return { error: null };
}

export async function updateSemiFinishedItem(
  businessId: string,
  itemId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = (formData.get("name") as string)?.trim();
  const unit = (formData.get("unit") as string)?.trim();
  const minStockRaw = formData.get("minStock") as string;
  const minStock = minStockRaw ? Number(minStockRaw) : 0;
  const fluctuationRaw = formData.get("fluctuationPct") as string;
  const fluctuationPct = fluctuationRaw ? Number(fluctuationRaw) : 0;

  if (!name || !unit) {
    return { error: "Nama dan satuan wajib diisi." };
  }
  if (!(minStock >= 0)) {
    return { error: "Stok minimum tidak valid." };
  }
  if (!(fluctuationPct >= 0) || fluctuationPct >= 100) {
    return { error: "Fluctuation % harus antara 0-99." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("semi_finished_items")
    .update({ name, unit, min_stock: minStock, fluctuation_pct: fluctuationPct })
    .eq("id", itemId)
    .eq("business_id", businessId);

  if (error) {
    return { error: error.message };
  }

  await logActivity(supabase, businessId, "produk", "info", `Bahan setengah jadi diubah: ${name}`);
  revalidatePath(`/business/${businessId}/semi-finished-items`);
  revalidatePath(`/business/${businessId}/semi-finished-items/${itemId}`);
  return { error: null };
}

export async function deleteSemiFinishedItem(businessId: string, itemId: string): Promise<ActionState> {
  const supabase = await createClient();

  const [{ data: usedAsComponent }, { data: usedInFinished }, { data: item }] = await Promise.all([
    supabase
      .from("semi_finished_recipes")
      .select("id")
      .eq("business_id", businessId)
      .eq("component_semi_finished_id", itemId)
      .limit(1),
    supabase
      .from("finished_product_recipes")
      .select("id")
      .eq("business_id", businessId)
      .eq("semi_finished_item_id", itemId)
      .limit(1),
    supabase.from("semi_finished_items").select("name").eq("id", itemId).eq("business_id", businessId).maybeSingle(),
  ]);

  if ((usedAsComponent && usedAsComponent.length > 0) || (usedInFinished && usedInFinished.length > 0)) {
    return { error: "Bahan ini masih dipakai sebagai komponen resep lain — hapus dulu dari resep tersebut." };
  }

  const { error } = await supabase
    .from("semi_finished_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("business_id", businessId);

  if (error) {
    return { error: error.message };
  }

  if (item) {
    await logActivity(supabase, businessId, "produk", "warning", `Bahan setengah jadi dihapus: ${item.name}`);
  }
  revalidatePath(`/business/${businessId}/semi-finished-items`);
  return { error: null };
}

export async function addRecipeComponent(
  businessId: string,
  semiFinishedItemId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const componentValue = (formData.get("component") as string) ?? "";
  const qtyRaw = formData.get("qty") as string;
  const qty = Number(qtyRaw);

  const [componentType, componentId] = componentValue.split(":");
  if (
    (componentType !== "ingredient" && componentType !== "semi_finished") ||
    !componentId
  ) {
    return { error: "Pilih komponen resep." };
  }
  if (!(qty > 0)) {
    return { error: "Jumlah harus lebih dari 0." };
  }

  const supabase = await createClient();

  if (componentType === "semi_finished") {
    const isCycle = await wouldCreateCycle(supabase, businessId, semiFinishedItemId, componentId);
    if (isCycle) {
      return { error: "Tidak bisa: ini akan membuat resep saling berputar (siklus)." };
    }
  }

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

  const { error } = await supabase.from("semi_finished_recipes").insert({
    business_id: businessId,
    semi_finished_item_id: semiFinishedItemId,
    component_type: componentType,
    ingredient_id: componentType === "ingredient" ? componentId : null,
    component_semi_finished_id: componentType === "semi_finished" ? componentId : null,
    qty,
    unit: component.unit,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/semi-finished-items/${semiFinishedItemId}`);
  revalidatePath(`/business/${businessId}/semi-finished-items`);
  revalidatePath(`/business/${businessId}/finished-products`);
  return { error: null };
}

export async function removeRecipeComponent(businessId: string, semiFinishedItemId: string, recipeRowId: string) {
  const supabase = await createClient();
  await supabase
    .from("semi_finished_recipes")
    .delete()
    .eq("id", recipeRowId)
    .eq("business_id", businessId);

  revalidatePath(`/business/${businessId}/semi-finished-items/${semiFinishedItemId}`);
  revalidatePath(`/business/${businessId}/semi-finished-items`);
  revalidatePath(`/business/${businessId}/finished-products`);
}
