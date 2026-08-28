"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type ImportActionState = { error: string | null; success: boolean };

export async function saveBsjImport(
  businessId: string,
  _prevState: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const itemName = (formData.get("itemName") as string)?.trim();
  const porsi = Number(formData.get("porsi"));
  const lossFactorPct = Number(formData.get("lossFactorPct"));

  if (!itemName) {
    return { error: "Pilih nama Bahan Setengah Jadi dulu.", success: false };
  }
  if (!(porsi > 0)) {
    return { error: "Jumlah Porsi harus lebih dari 0.", success: false };
  }
  if (!(lossFactorPct >= 0) || lossFactorPct >= 100) {
    return { error: "Loss Faktor % harus antara 0-99.", success: false };
  }

  const supabase = await createClient();

  const { data: rows, error: stagingErr } = await supabase
    .from("bsj_import_staging")
    .select("ingredient_id, qty_per_batch, unit")
    .eq("business_id", businessId)
    .eq("item_name", itemName);
  if (stagingErr) return { error: stagingErr.message, success: false };
  if (!rows || rows.length === 0) {
    return { error: "Data resep untuk menu ini tidak ditemukan di data import.", success: false };
  }

  const { data: existing } = await supabase
    .from("semi_finished_items")
    .select("id")
    .eq("business_id", businessId)
    .eq("name", itemName)
    .is("deleted_at", null)
    .maybeSingle();

  let itemId: string;
  if (existing) {
    itemId = existing.id;
    const { error: updErr } = await supabase
      .from("semi_finished_items")
      .update({ fluctuation_pct: lossFactorPct })
      .eq("id", itemId)
      .eq("business_id", businessId);
    if (updErr) return { error: updErr.message, success: false };
  } else {
    const { data: created, error: insErr } = await supabase
      .from("semi_finished_items")
      .insert({ business_id: businessId, name: itemName, unit: "porsi", fluctuation_pct: lossFactorPct })
      .select("id")
      .single();
    if (insErr || !created) return { error: insErr?.message ?? "Gagal membuat item.", success: false };
    itemId = created.id;
  }

  // Re-import bersifat idempotent -- resep lama untuk item ini dihapus dulu
  // baru diisi ulang dari data import, supaya bisa diulang kalau ada koreksi.
  const { error: delErr } = await supabase
    .from("semi_finished_recipes")
    .delete()
    .eq("business_id", businessId)
    .eq("semi_finished_item_id", itemId);
  if (delErr) return { error: delErr.message, success: false };

  const newRows = rows.map((r) => ({
    business_id: businessId,
    semi_finished_item_id: itemId,
    component_type: "ingredient" as const,
    ingredient_id: r.ingredient_id,
    qty: r.qty_per_batch / porsi,
    unit: r.unit,
  }));
  const { error: insRecipeErr } = await supabase.from("semi_finished_recipes").insert(newRows);
  if (insRecipeErr) return { error: insRecipeErr.message, success: false };

  await logActivity(supabase, businessId, "produk", "sukses", `Resep diimpor dari Data Excel: ${itemName} (${rows.length} bahan)`);

  revalidatePath(`/business/${businessId}/semi-finished-items`);
  revalidatePath(`/business/${businessId}/semi-finished-items/import`);
  revalidatePath(`/business/${businessId}/finished-products`);
  return { error: null, success: true };
}
