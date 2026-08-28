"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type ImportActionState = { error: string | null; success: boolean };

export async function saveProdukJadiImport(
  businessId: string,
  _prevState: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const itemName = (formData.get("itemName") as string)?.trim();
  const porsi = Number(formData.get("porsi"));
  const lossFactorPct = Number(formData.get("lossFactorPct"));

  if (!itemName) {
    return { error: "Pilih nama Produk Jadi dulu.", success: false };
  }
  if (!(porsi > 0)) {
    return { error: "Jumlah Porsi harus lebih dari 0.", success: false };
  }
  if (!(lossFactorPct >= 0) || lossFactorPct >= 100) {
    return { error: "Loss Faktor % harus antara 0-99.", success: false };
  }

  const supabase = await createClient();

  const { data: rows, error: stagingErr } = await supabase
    .from("finished_product_import_staging")
    .select("component_type, ingredient_id, semi_finished_item_id, qty_per_batch, unit")
    .eq("business_id", businessId)
    .eq("item_name", itemName);
  if (stagingErr) return { error: stagingErr.message, success: false };
  if (!rows || rows.length === 0) {
    return { error: "Data resep untuk menu ini tidak ditemukan di data import.", success: false };
  }

  const { data: existing } = await supabase
    .from("finished_products")
    .select("id")
    .eq("business_id", businessId)
    .eq("name", itemName)
    .is("deleted_at", null)
    .maybeSingle();

  let productId: string;
  if (existing) {
    productId = existing.id;
    const { error: updErr } = await supabase
      .from("finished_products")
      .update({ fluctuation_pct: lossFactorPct })
      .eq("id", productId)
      .eq("business_id", businessId);
    if (updErr) return { error: updErr.message, success: false };
  } else {
    const { data: created, error: insErr } = await supabase
      .from("finished_products")
      .insert({ business_id: businessId, name: itemName, fluctuation_pct: lossFactorPct })
      .select("id")
      .single();
    if (insErr || !created) return { error: insErr?.message ?? "Gagal membuat produk.", success: false };
    productId = created.id;
  }

  // Re-import bersifat idempotent -- resep lama untuk item ini dihapus dulu
  // baru diisi ulang dari data import, supaya bisa diulang kalau ada koreksi.
  const { error: delErr } = await supabase
    .from("finished_product_recipes")
    .delete()
    .eq("business_id", businessId)
    .eq("finished_product_id", productId);
  if (delErr) return { error: delErr.message, success: false };

  const newRows = rows
    .filter((r) => r.qty_per_batch > 0)
    .map((r) => ({
      business_id: businessId,
      finished_product_id: productId,
      component_type: r.component_type,
      ingredient_id: r.ingredient_id,
      semi_finished_item_id: r.semi_finished_item_id,
      qty: r.qty_per_batch / porsi,
      unit: r.unit,
    }));
  if (newRows.length === 0) {
    return { error: "Tidak ada bahan dengan qty > 0 untuk disimpan.", success: false };
  }
  const { error: insRecipeErr } = await supabase.from("finished_product_recipes").insert(newRows);
  if (insRecipeErr) return { error: insRecipeErr.message, success: false };

  await logActivity(supabase, businessId, "produk", "sukses", `Resep Produk Jadi diimpor dari Data Excel: ${itemName} (${newRows.length} bahan)`);

  revalidatePath(`/business/${businessId}/finished-products`);
  revalidatePath(`/business/${businessId}/finished-products/import`);
  return { error: null, success: true };
}
