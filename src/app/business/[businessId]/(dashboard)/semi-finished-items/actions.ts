"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { wouldCreateCycle } from "@/lib/cost-control/compute-cost";
import { getCurrentActor } from "@/lib/current-actor";
import { recalculateProductCostsForIngredient } from "@/lib/recalculate-product-cost";

export type ActionState = { error: string | null };

// "Bagian" — reuse pool ingredient_opname_sections (sama daftar dgn Bahan
// Baku, lihat ingredients/actions.ts) supaya BSJ juga bisa dipangkas per
// Bagian Lokasi Ini/Stok Opname. Sync penuh (hapus semua, insert ulang).
export async function updateSemiFinishedItemOpnameSections(
  businessId: string,
  itemId: string,
  sectionIds: string[],
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { error: delError } = await supabase
    .from("semi_finished_item_opname_section_items")
    .delete()
    .eq("semi_finished_item_id", itemId)
    .eq("business_id", businessId);
  if (delError) return { error: delError.message };

  if (sectionIds.length > 0) {
    const { error: insError } = await supabase.from("semi_finished_item_opname_section_items").insert(
      sectionIds.map((sectionId) => ({
        business_id: businessId,
        semi_finished_item_id: itemId,
        section_id: sectionId,
      })),
    );
    if (insError) return { error: insError.message };
  }

  revalidatePath(`/business/${businessId}/semi-finished-items`);
  return { error: null };
}

// `recipeRows` (opsional, dikirim RecipeRowsBuilder sebagai JSON di hidden
// input) -- biar staf bisa langsung isi komponen+jumlah resep saat BIKIN
// item baru, tidak perlu buka halaman detail & edit lagi setelah tersimpan.
// qty di tiap baris SUDAH dalam satuan dasar komponen (konversi kg/liter
// sudah dilakukan di client, sama pola dengan RecipeEditor). Cycle-check
// tidak perlu di sini -- item ini baru dibuat, belum mungkin ada resep lain
// yang menunjuk balik ke dia.
type RecipeRowInput = { component: string; qty: number };

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
  const isManualCost = formData.get("isManualCost") === "on";
  const manualUnitCostRaw = formData.get("manualUnitCost") as string;
  let manualUnitCost: number | null = null;

  if (!name || !unit) {
    return { error: "Nama dan satuan wajib diisi." };
  }
  if (!(minStock >= 0)) {
    return { error: "Stok minimum tidak valid." };
  }
  if (!(fluctuationPct >= 0) || fluctuationPct >= 100) {
    return { error: "Fluctuation % harus antara 0-99." };
  }
  if (isManualCost) {
    manualUnitCost = Number(manualUnitCostRaw);
    if (!manualUnitCostRaw || Number.isNaN(manualUnitCost) || manualUnitCost < 0) {
      return { error: "HPP manual harus angka 0 atau lebih." };
    }
  }

  const recipeRowsRaw = isManualCost ? null : (formData.get("recipeRows") as string | null);
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
      manual_unit_cost: manualUnitCost,
      batch_yield_qty: recipeRows.length > 0 && recipeYieldQty && recipeYieldQty > 0 ? recipeYieldQty : null,
    })
    .select("id")
    .single();

  if (error || !newItem) {
    return { error: error?.message.includes("semi_finished_items_business_id_barcode_key") ? "Barcode sudah dipakai bahan setengah jadi lain." : (error?.message ?? "Gagal menyimpan.") };
  }

  // Kembaran di Bahan Baku -- inilah yang sebenarnya dipakai resep PRODUK
  // (product_recipes) & checkout (lihat migration 20260903010000). Stok &
  // unit_cost kembaran ini di-update lewat fitur Produksi (weighted average,
  // lihat produceSemiFinishedItem), bukan diketik manual.
  //
  // HANYA dikecualikan untuk bisnis cost_control_enabled (mis. Llauk SAAT
  // MASIH mode Cost Control) -- mereka pakai finished_product_recipes yang
  // punya semi_finished_item_id LANGSUNG, tidak butuh kembaran sama sekali,
  // kalau ikut dibuat cuma jadi baris kosong yang mengotori Bahan Baku.
  //
  // rich_stock_ops_enabled (Llauk pasca-konversi ke tampilan Kasirku
  // standar) JUSTRU BUTUH kembaran ini -- setelah konversi, "Kelola Produk"
  // mereka pakai product_recipes biasa (lihat products/page.tsx), yang CUMA
  // paham ingredient_id, tidak ada konsep semi_finished_item_id sama sekali.
  // Versi sebelumnya salah ikut mengecualikan rich_stock_ops_enabled di sini
  // (asumsinya keliru: dikira masih pakai finished_product_recipes) --
  // akibatnya 78 BSJ Llauk (semua item "HM...") kehilangan kembarannya dan
  // tidak bisa dipakai di resep produk / Import Resep Produk sama sekali
  // (laporan user 2026-09-03, dibetulkan juga lewat backfill data manual).
  const { data: businessForMirror } = await supabase
    .from("businesses")
    .select("cost_control_enabled")
    .eq("id", businessId)
    .single();

  if (!businessForMirror?.cost_control_enabled) {
    const { data: mirrorIngredient } = await supabase
      .from("ingredients")
      .insert({
        business_id: businessId,
        name,
        unit,
        unit_cost: 0,
        stock: 0,
        min_stock: minStock,
      })
      .select("id")
      .single();

    if (mirrorIngredient) {
      await supabase.from("semi_finished_items").update({ ingredient_id: mirrorIngredient.id }).eq("id", newItem.id);
    }
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
  const isManualCost = formData.get("isManualCost") === "on";
  const manualUnitCostRaw = formData.get("manualUnitCost") as string;
  let manualUnitCost: number | null = null;

  if (!name || !unit) {
    return { error: "Nama dan satuan wajib diisi." };
  }
  if (!(minStock >= 0)) {
    return { error: "Stok minimum tidak valid." };
  }
  if (!(fluctuationPct >= 0) || fluctuationPct >= 100) {
    return { error: "Fluctuation % harus antara 0-99." };
  }
  if (isManualCost) {
    manualUnitCost = Number(manualUnitCostRaw);
    if (!manualUnitCostRaw || Number.isNaN(manualUnitCost) || manualUnitCost < 0) {
      return { error: "HPP manual harus angka 0 atau lebih." };
    }
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("semi_finished_items")
    .select("ingredient_id")
    .eq("id", itemId)
    .eq("business_id", businessId)
    .maybeSingle();

  const { error } = await supabase
    .from("semi_finished_items")
    .update({
      name,
      unit,
      min_stock: minStock,
      fluctuation_pct: fluctuationPct,
      barcode,
      category,
      manual_unit_cost: manualUnitCost,
    })
    .eq("id", itemId)
    .eq("business_id", businessId);

  if (error) {
    return { error: error.message.includes("semi_finished_items_business_id_barcode_key") ? "Barcode sudah dipakai bahan setengah jadi lain." : error.message };
  }

  // Sinkronkan nama/unit ke kembaran di Bahan Baku supaya tidak beda nama
  // antara halaman BSJ dan halaman Bahan Baku (stok/unit_cost kembaran TIDAK
  // disentuh di sini -- itu murni domain fitur Produksi).
  if (existing?.ingredient_id) {
    await supabase.from("ingredients").update({ name, unit, min_stock: minStock }).eq("id", existing.ingredient_id);
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

export type ProduceResult = { error: string | null };

// Produksi BSJ: potong bahan mentah di 1 lokasi sesuai resep tersimpan,
// tambah stok kembaran BSJ (di ingredients) di lokasi yang sama, hitung
// ulang unit_cost kembaran dari total biaya bahan yang terpakai (weighted
// average, pola sama persis addPurchase di purchases/actions.ts). Baris
// resep yang menunjuk BSJ lain (component_type='semi_finished') di-resolve
// ke KEMBARAN ingredient milik BSJ itu -- jadi BSJ bersarang dikonsumsi dari
// stok BSJ-nya sendiri yang sudah jadi, bukan diurai ulang jadi bahan mentah
// aslinya lagi (sama seperti dapur nyata: pakai Kaldu Ayam yang sudah ada,
// bukan masak ulang dari Ayam+Air tiap kali).
export async function produceSemiFinishedItem(
  businessId: string,
  semiFinishedItemId: string,
  locationId: string,
  qtyProduced: number,
): Promise<ProduceResult> {
  if (!(qtyProduced > 0)) {
    return { error: "Jumlah produksi harus lebih dari 0." };
  }

  const supabase = await createClient();

  const [{ data: business }, { data: item }, { data: location }] = await Promise.all([
    supabase
      .from("businesses")
      .select("cost_control_enabled, stock_locations_enabled, rich_stock_ops_enabled")
      .eq("id", businessId)
      .single(),
    supabase
      .from("semi_finished_items")
      .select("id, name, unit, ingredient_id")
      .eq("id", semiFinishedItemId)
      .eq("business_id", businessId)
      .maybeSingle(),
    supabase.from("stock_locations").select("id, name").eq("id", locationId).eq("business_id", businessId).maybeSingle(),
  ]);

  // Khusus bisnis stok-lite -- bisnis cost-control (Llauk dkk) sudah punya
  // fitur Produksi sendiri (halaman /produksi, production_runs) yang
  // langsung ke semi_finished_item_location_stock, tidak lewat kembaran
  // ingredient ini sama sekali.
  if (!business || business.cost_control_enabled || business.rich_stock_ops_enabled || !business.stock_locations_enabled) {
    return { error: "Fitur Produksi ini tidak tersedia untuk bisnis ini." };
  }
  if (!item) return { error: "Bahan setengah jadi tidak ditemukan." };
  if (!item.ingredient_id) {
    return { error: "BSJ ini belum punya bahan baku terhubung — buka & simpan ulang datanya dulu." };
  }
  if (!location) return { error: "Lokasi tidak ditemukan." };

  const { data: recipeRows } = await supabase
    .from("semi_finished_recipes")
    .select("ingredient_id, component_semi_finished_id, component_type, qty")
    .eq("business_id", businessId)
    .eq("semi_finished_item_id", semiFinishedItemId);

  if (!recipeRows || recipeRows.length === 0) {
    return { error: "Resep BSJ ini masih kosong — isi dulu di bagian Resep sebelum produksi." };
  }

  // Resolve tiap baris resep ke ingredientId nyata (BSJ komponen -> kembarannya).
  const nestedSemiIds = recipeRows
    .filter((r) => r.component_type === "semi_finished" && r.component_semi_finished_id)
    .map((r) => r.component_semi_finished_id as string);
  const { data: nestedItems } = nestedSemiIds.length
    ? await supabase.from("semi_finished_items").select("id, name, ingredient_id").in("id", nestedSemiIds)
    : { data: [] as { id: string; name: string; ingredient_id: string | null }[] };
  const nestedById = new Map((nestedItems ?? []).map((n) => [n.id, n]));

  const neededByIngredient = new Map<string, number>();
  for (const row of recipeRows) {
    let resolvedIngredientId: string | null = null;
    if (row.component_type === "ingredient") {
      resolvedIngredientId = row.ingredient_id;
    } else {
      const nested = nestedById.get(row.component_semi_finished_id ?? "");
      if (!nested?.ingredient_id) {
        return {
          error: `Komponen "${nested?.name ?? "BSJ lain"}" di resep ini belum punya bahan baku terhubung — buka & simpan ulang datanya dulu.`,
        };
      }
      resolvedIngredientId = nested.ingredient_id;
    }
    if (!resolvedIngredientId) continue;
    const qtyNeeded = Number(row.qty) * qtyProduced;
    neededByIngredient.set(resolvedIngredientId, (neededByIngredient.get(resolvedIngredientId) ?? 0) + qtyNeeded);
  }

  const consumedIds = [...neededByIngredient.keys()];
  const [{ data: consumedIngredients }, { data: consumedLocStock }] = await Promise.all([
    supabase.from("ingredients").select("id, name, unit, unit_cost, stock").in("id", consumedIds),
    supabase
      .from("ingredient_location_stock")
      .select("ingredient_id, stock")
      .eq("business_id", businessId)
      .eq("location_id", locationId)
      .in("ingredient_id", consumedIds),
  ]);
  const consumedIngredientById = new Map((consumedIngredients ?? []).map((i) => [i.id, i]));
  const consumedStockById = new Map((consumedLocStock ?? []).map((r) => [r.ingredient_id, Number(r.stock)]));

  // Cek kecukupan stok SEMUA bahan dulu sebelum menulis apapun -- semua-atau-tidak.
  for (const [ingredientId, qtyNeeded] of neededByIngredient) {
    const ingredient = consumedIngredientById.get(ingredientId);
    const available = consumedStockById.get(ingredientId) ?? 0;
    if (available < qtyNeeded) {
      return {
        error: `Stok ${ingredient?.name ?? "bahan"} di ${location.name} cuma ${available} ${ingredient?.unit ?? ""}, kurang untuk produksi ini (butuh ${qtyNeeded}).`,
      };
    }
  }

  const actor = await getCurrentActor(supabase, businessId);
  let batchCost = 0;

  for (const [ingredientId, qtyNeeded] of neededByIngredient) {
    const ingredient = consumedIngredientById.get(ingredientId)!;
    const stockBefore = consumedStockById.get(ingredientId) ?? 0;
    const stockAfter = stockBefore - qtyNeeded;
    batchCost += Number(ingredient.unit_cost) * qtyNeeded;

    await supabase
      .from("ingredient_location_stock")
      .update({ stock: stockAfter, updated_at: new Date().toISOString() })
      .eq("business_id", businessId)
      .eq("location_id", locationId)
      .eq("ingredient_id", ingredientId);

    await supabase
      .from("ingredients")
      .update({ stock: Math.max(0, Number(ingredient.stock) - qtyNeeded) })
      .eq("id", ingredientId);

    await supabase.from("stock_adjustments").insert({
      business_id: businessId,
      ingredient_id: ingredientId,
      location_id: locationId,
      item_name: ingredient.name,
      unit: ingredient.unit,
      stock_before: stockBefore,
      stock_after: stockAfter,
      diff: -qtyNeeded,
      reason: `Produksi ${item.name}`,
      submitted_by_name: actor?.name ?? null,
    });
  }

  // Kembaran BSJ: tambah stok di lokasi + flat, hitung unit_cost weighted-average
  // dari total yang dimiliki di SEMUA lokasi -- pola sama persis addPurchase.
  const { data: mirrorLocRows } = await supabase
    .from("ingredient_location_stock")
    .select("id, location_id, stock")
    .eq("business_id", businessId)
    .eq("ingredient_id", item.ingredient_id);
  const { data: mirrorIngredient } = await supabase
    .from("ingredients")
    .select("id, name, unit, stock, unit_cost")
    .eq("id", item.ingredient_id)
    .single();

  if (!mirrorIngredient) return { error: "Bahan baku kembaran BSJ ini tidak ditemukan." };

  const totalOwnedBefore = (mirrorLocRows ?? []).reduce((sum, r) => sum + Number(r.stock), 0);
  const oldValue = totalOwnedBefore * Number(mirrorIngredient.unit_cost);
  const newTotalOwned = totalOwnedBefore + qtyProduced;
  const newUnitCost = newTotalOwned > 0 ? Math.round((oldValue + batchCost) / newTotalOwned) : Number(mirrorIngredient.unit_cost);

  const targetRow = (mirrorLocRows ?? []).find((r) => r.location_id === locationId);
  const mirrorStockBeforeAtLocation = Number(targetRow?.stock ?? 0);
  const mirrorStockAfterAtLocation = mirrorStockBeforeAtLocation + qtyProduced;

  if (targetRow) {
    await supabase
      .from("ingredient_location_stock")
      .update({ stock: mirrorStockAfterAtLocation, updated_at: new Date().toISOString() })
      .eq("id", targetRow.id);
  } else {
    await supabase.from("ingredient_location_stock").insert({
      business_id: businessId,
      location_id: locationId,
      ingredient_id: item.ingredient_id,
      stock: qtyProduced,
    });
  }

  await supabase
    .from("ingredients")
    .update({ stock: Number(mirrorIngredient.stock) + qtyProduced, unit_cost: newUnitCost })
    .eq("id", item.ingredient_id);

  await supabase.from("stock_adjustments").insert({
    business_id: businessId,
    ingredient_id: item.ingredient_id,
    location_id: locationId,
    item_name: mirrorIngredient.name,
    unit: mirrorIngredient.unit,
    stock_before: mirrorStockBeforeAtLocation,
    stock_after: mirrorStockAfterAtLocation,
    diff: qtyProduced,
    reason: "Hasil Produksi",
    submitted_by_name: actor?.name ?? null,
  });

  await recalculateProductCostsForIngredient(supabase, item.ingredient_id);

  await logActivity(
    supabase,
    businessId,
    "produk",
    "sukses",
    `Produksi: ${item.name}`,
    `${qtyProduced} ${item.unit} di ${location.name}${actor ? ` · oleh ${actor.name}` : ""}`,
  );

  revalidatePath(`/business/${businessId}/semi-finished-items`);
  revalidatePath(`/business/${businessId}/semi-finished-items/${semiFinishedItemId}`);
  revalidatePath(`/business/${businessId}/ingredients`);
  revalidatePath(`/business/${businessId}/lokasi/${locationId}/bahan-baku`);
  revalidatePath(`/business/${businessId}/lokasi/${locationId}/kartu-stok`);

  return { error: null };
}
