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

  // Cocokkan case-insensitive & spasi longgar -- .eq("name", ...) yang
  // case-sensitive bikin BSJ yang namanya beda kapitalisasi doang (mis.
  // Excel ALL CAPS vs nama BSJ Title Case) dianggap "belum ada" dan MALAH
  // BIKIN DUPLIKAT baru (+ kembaran ingredient baru) alih-alih nyambung ke
  // BSJ yang sudah ada.
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const { data: candidateItems } = await supabase
    .from("semi_finished_items")
    .select("id, name, ingredient_id")
    .eq("business_id", businessId)
    .is("deleted_at", null);
  const existing = (candidateItems ?? []).find((i) => norm(i.name) === norm(itemName));

  let itemId: string;
  let needsMirror = false;
  if (existing) {
    itemId = existing.id;
    needsMirror = !existing.ingredient_id;
    const { error: updErr } = await supabase
      .from("semi_finished_items")
      .update({ fluctuation_pct: lossFactorPct, batch_yield_qty: porsi })
      .eq("id", itemId)
      .eq("business_id", businessId);
    if (updErr) return { error: updErr.message, success: false };
  } else {
    const { data: created, error: insErr } = await supabase
      .from("semi_finished_items")
      .insert({ business_id: businessId, name: itemName, unit: "porsi", fluctuation_pct: lossFactorPct, batch_yield_qty: porsi })
      .select("id")
      .single();
    if (insErr || !created) return { error: insErr?.message ?? "Gagal membuat item.", success: false };
    itemId = created.id;
    needsMirror = true;
  }

  // Kembaran di Bahan Baku -- sama alasan & syarat dengan addSemiFinishedItem
  // (semi-finished-items/actions.ts): wajib supaya item ini bisa dipakai di
  // resep produk (product_recipes cuma paham ingredient_id) untuk bisnis
  // non-cost-control. Item lama yang belum punya kembaran (laporan user
  // 2026-09-03) ikut dibetulkan di sini, bukan cuma item baru.
  if (needsMirror) {
    const { data: businessForMirror } = await supabase
      .from("businesses")
      .select("cost_control_enabled")
      .eq("id", businessId)
      .single();
    if (!businessForMirror?.cost_control_enabled) {
      const { data: mirrorIngredient } = await supabase
        .from("ingredients")
        .insert({ business_id: businessId, name: itemName, unit: "porsi", unit_cost: 0, stock: 0, min_stock: 0 })
        .select("id")
        .single();
      if (mirrorIngredient) {
        await supabase.from("semi_finished_items").update({ ingredient_id: mirrorIngredient.id }).eq("id", itemId);
      }
    }
  }

  // Re-import bersifat idempotent -- resep lama untuk item ini dihapus dulu
  // baru diisi ulang dari data import, supaya bisa diulang kalau ada koreksi.
  const { error: delErr } = await supabase
    .from("semi_finished_recipes")
    .delete()
    .eq("business_id", businessId)
    .eq("semi_finished_item_id", itemId);
  if (delErr) return { error: delErr.message, success: false };

  // Baris dengan gramasi 0 (bahan tercatat tapi qty-nya kosong di data
  // Excel, mis. "Air" tanpa takaran) tidak boleh masuk -- semi_finished_recipes
  // mewajibkan qty > 0 -- jadi cuma dilewati, bukan bikin simpan gagal total.
  const newRows = rows
    .filter((r) => r.qty_per_batch > 0)
    .map((r) => ({
      business_id: businessId,
      semi_finished_item_id: itemId,
      component_type: "ingredient" as const,
      ingredient_id: r.ingredient_id,
      qty: r.qty_per_batch / porsi,
      unit: r.unit,
    }));
  if (newRows.length === 0) {
    return { error: "Tidak ada bahan dengan qty > 0 untuk disimpan.", success: false };
  }
  const { error: insRecipeErr } = await supabase.from("semi_finished_recipes").insert(newRows);
  if (insRecipeErr) return { error: insRecipeErr.message, success: false };

  await logActivity(supabase, businessId, "produk", "sukses", `Resep diimpor dari Data Excel: ${itemName} (${newRows.length} bahan)`);

  revalidatePath(`/business/${businessId}/semi-finished-items`);
  revalidatePath(`/business/${businessId}/semi-finished-items/import`);
  revalidatePath(`/business/${businessId}/finished-products`);
  return { error: null, success: true };
}
