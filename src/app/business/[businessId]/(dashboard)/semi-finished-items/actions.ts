"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { wouldCreateCycle } from "@/lib/cost-control/compute-cost";

export type ActionState = { error: string | null };

// `recipeRows` (opsional, dikirim RecipeRowsBuilder sebagai JSON di hidden
// input) -- biar staf bisa langsung isi komponen+jumlah resep saat BIKIN
// item baru, tidak perlu buka halaman detail & edit lagi setelah tersimpan.
// qty di tiap baris SUDAH dalam satuan dasar komponen (konversi kg/liter
// sudah dilakukan di client, sama pola dengan RecipeEditor). Cycle-check
// tidak perlu di sini -- item ini baru dibuat, belum mungkin ada resep lain
// yang menunjuk balik ke dia.
type RecipeRowInput = { component: string; qty: number };

export type AdjustStockResult = { error: string | null };

// Adjust stok BSJ manual -- dicontoh dari adjustIngredientStock di
// ingredients/actions.ts. Sengaja HANYA dipakai bisnis stok-lite (mis. Adi's
// Culinary, !cost_control_enabled) yang tidak pakai halaman Produksi --
// lihat page.tsx, kontrolnya cuma dirender untuk bisnis itu supaya tidak ada
// 2 jalur tulis stok yang tidak sinkron untuk bisnis yang sudah pakai
// Produksi (Llauk).
export async function adjustSemiFinishedItemStock(
  businessId: string,
  itemId: string,
  newStock: number,
  reason: string,
): Promise<AdjustStockResult> {
  if (Number.isNaN(newStock) || newStock < 0) {
    return { error: "Stok fisik harus angka dan tidak boleh negatif." };
  }
  reason = reason.trim();
  if (!reason) {
    return { error: "Alasan penyesuaian wajib diisi." };
  }

  const supabase = await createClient();

  const { data: item } = await supabase
    .from("semi_finished_items")
    .select("id, name, unit, stock")
    .eq("id", itemId)
    .eq("business_id", businessId)
    .single();

  if (!item) {
    return { error: "Bahan setengah jadi tidak ditemukan." };
  }

  const stockBefore = Number(item.stock);
  const diff = newStock - stockBefore;

  if (diff === 0) {
    return { error: "Stok fisik sama dengan stok sistem, tidak ada yang disesuaikan." };
  }

  const { error: updateError } = await supabase
    .from("semi_finished_items")
    .update({ stock: newStock })
    .eq("id", itemId);

  if (updateError) {
    return { error: updateError.message };
  }

  await supabase.from("stock_adjustments").insert({
    business_id: businessId,
    semi_finished_item_id: itemId,
    item_name: item.name,
    unit: item.unit,
    stock_before: stockBefore,
    stock_after: newStock,
    diff,
    reason,
  });

  await logActivity(
    supabase,
    businessId,
    "produk",
    "warning",
    `Penyesuaian stok BSJ: ${item.name}`,
    `${stockBefore} → ${newStock} ${item.unit} (${diff > 0 ? "+" : ""}${diff}) · ${reason}`,
  );
  revalidatePath(`/business/${businessId}/semi-finished-items`);
  revalidatePath(`/business/${businessId}/semi-finished-items/${itemId}`);
  return { error: null };
}

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
  const barcode = (formData.get("barcode") as string)?.trim() || null;
  const category = (formData.get("category") as string)?.trim() || null;

  if (!name || !unit) {
    return { error: "Nama dan satuan wajib diisi." };
  }
  if (!(minStock >= 0)) {
    return { error: "Stok minimum tidak valid." };
  }
  if (!(fluctuationPct >= 0) || fluctuationPct >= 100) {
    return { error: "Fluctuation % harus antara 0-99." };
  }

  const recipeRowsRaw = formData.get("recipeRows") as string | null;
  let recipeRows: RecipeRowInput[] = [];
  if (recipeRowsRaw) {
    try {
      recipeRows = JSON.parse(recipeRowsRaw);
    } catch {
      return { error: "Data komponen resep tidak valid." };
    }
  }
  const recipeYieldRaw = formData.get("recipeYieldQty") as string | null;
  const recipeYieldQty = recipeYieldRaw ? Number(recipeYieldRaw) : null;
  for (const row of recipeRows) {
    const [componentType, componentId] = String(row.component ?? "").split(":");
    if ((componentType !== "ingredient" && componentType !== "semi_finished") || !componentId) {
      return { error: "Komponen resep tidak valid." };
    }
    if (!(Number(row.qty) > 0)) {
      return { error: "Jumlah komponen resep harus lebih dari 0." };
    }
  }

  const supabase = await createClient();
  const { data: newItem, error } = await supabase
    .from("semi_finished_items")
    .insert({
      business_id: businessId,
      name,
      unit,
      min_stock: minStock,
      fluctuation_pct: fluctuationPct,
      barcode,
      category,
      batch_yield_qty: recipeRows.length > 0 && recipeYieldQty && recipeYieldQty > 0 ? recipeYieldQty : null,
    })
    .select("id")
    .single();

  if (error || !newItem) {
    return { error: error?.message.includes("semi_finished_items_business_id_barcode_key") ? "Barcode sudah dipakai bahan setengah jadi lain." : (error?.message ?? "Gagal menyimpan.") };
  }

  for (const row of recipeRows) {
    const [componentType, componentId] = row.component.split(":");
    const table = componentType === "ingredient" ? "ingredients" : "semi_finished_items";
    const { data: component } = await supabase
      .from(table)
      .select("unit")
      .eq("id", componentId)
      .eq("business_id", businessId)
      .maybeSingle();
    if (!component) continue;

    await supabase.from("semi_finished_recipes").insert({
      business_id: businessId,
      semi_finished_item_id: newItem.id,
      component_type: componentType,
      ingredient_id: componentType === "ingredient" ? componentId : null,
      component_semi_finished_id: componentType === "semi_finished" ? componentId : null,
      qty: row.qty,
      unit: component.unit,
    });
  }

  await logActivity(supabase, businessId, "produk", "sukses", `Bahan setengah jadi baru: ${name}`);
  revalidatePath(`/business/${businessId}/semi-finished-items`);
  revalidatePath(`/business/${businessId}/finished-products`);
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
  const barcode = (formData.get("barcode") as string)?.trim() || null;
  const category = (formData.get("category") as string)?.trim() || null;

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
    .update({ name, unit, min_stock: minStock, fluctuation_pct: fluctuationPct, barcode, category })
    .eq("id", itemId)
    .eq("business_id", businessId);

  if (error) {
    return { error: error.message.includes("semi_finished_items_business_id_barcode_key") ? "Barcode sudah dipakai bahan setengah jadi lain." : error.message };
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

// "Resep ini menghasilkan berapa" -- batch size dipakai buat 2 hal: (1)
// RecipeEditor bisa nawarin input qty "per batch" (dibagi ke per-1-satuan di
// client sebelum submit, sama pola konversi kg/liter yang sudah ada), (2)
// halaman detail bisa nampilin balik preview "per batch" dari qty per-1-
// satuan yang tersimpan (qty * batch_yield_qty).
export async function updateRecipeYield(
  businessId: string,
  itemId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const yieldQty = Number(formData.get("yieldQty"));
  if (!(yieldQty > 0)) {
    return { error: "Jumlah harus lebih dari 0." };
  }

  const supabase = await createClient();

  const { data: item } = await supabase
    .from("semi_finished_items")
    .select("batch_yield_qty")
    .eq("id", itemId)
    .eq("business_id", businessId)
    .maybeSingle();
  const oldYieldQty = item?.batch_yield_qty !== null && item?.batch_yield_qty !== undefined
    ? Number(item.batch_yield_qty)
    : null;

  // Kalau sebelumnya sudah ada batch_yield_qty, user mengubah angka ini
  // berarti "bahan totalnya tetap sama, cuma sekarang dibagi ke jumlah
  // porsi yang beda" -- jadi qty per-1-satuan di tiap baris resep ikut
  // diskalakan proporsional, bukan cuma ganti labelnya (kalau tidak, HPP
  // per satuan salah tampil tetap sama padahal batch-nya sudah berubah).
  // Kalau belum pernah diisi (null), tidak ada basis buat skala -- simpan
  // apa adanya, sama seperti pengisian pertama kali.
  if (oldYieldQty !== null && oldYieldQty > 0 && oldYieldQty !== yieldQty) {
    const factor = oldYieldQty / yieldQty;
    const { data: rows } = await supabase
      .from("semi_finished_recipes")
      .select("id, qty")
      .eq("business_id", businessId)
      .eq("semi_finished_item_id", itemId);

    const results = await Promise.all(
      (rows ?? []).map((row) =>
        supabase
          .from("semi_finished_recipes")
          .update({ qty: Number(row.qty) * factor })
          .eq("id", row.id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) return { error: failed.error.message };
  }

  const { error } = await supabase
    .from("semi_finished_items")
    .update({ batch_yield_qty: yieldQty })
    .eq("id", itemId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/semi-finished-items/${itemId}`);
  revalidatePath(`/business/${businessId}/semi-finished-items`);
  revalidatePath(`/business/${businessId}/finished-products`);
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
