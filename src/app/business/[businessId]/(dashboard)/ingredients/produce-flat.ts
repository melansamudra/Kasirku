import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { recalculateProductCostsForIngredient } from "@/lib/recalculate-product-cost";

// Produksi bahan setengah jadi (BSJ) versi FLAT -- untuk bisnis yang TIDAK
// pakai stock_locations sama sekali (mis. Mie Kota). Fitur "Catat Produksi"
// yang sudah ada (produksi/actions.ts, semi-finished-items/actions.ts
// produceSemiFinishedItem) SELALU mensyaratkan stock_locations dalam
// bentuk apa pun -- ini jalur ketiga yang kerja murni di ingredients.stock/
// semi_finished_items.stock global, mengikuti pola weighted-average yang
// sama dengan addPurchase (finance/actions.ts).
//
// Keterbatasan sengaja: cuma menangani komponen bertipe 'ingredient' dengan
// benar. Komponen nested (BSJ di dalam BSJ) di-skip potongannya (dicatat di
// activity log sebagai peringatan) -- Mie Kota tidak punya BSJ berlapis,
// dan menangani kasus itu dengan benar butuh rekursi cost graph penuh
// (lihat compute-cost.ts) yang di luar cakupan produksi awal sesederhana ini.
export async function produceSemiFinishedFlat(
  supabase: SupabaseClient<Database>,
  businessId: string,
  semiFinishedItemId: string,
  produceQty: number,
): Promise<{ error: string | null; warnings: string[] }> {
  const warnings: string[] = [];

  const { data: item } = await supabase
    .from("semi_finished_items")
    .select("id, name, unit, stock, manual_unit_cost, ingredient_id")
    .eq("id", semiFinishedItemId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!item) return { error: "Bahan setengah jadi tidak ditemukan.", warnings };
  if (!item.ingredient_id) {
    return { error: "Bahan setengah jadi ini belum punya kembaran di Bahan Baku, tidak bisa diproduksi.", warnings };
  }

  const { data: recipeRows } = await supabase
    .from("semi_finished_recipes")
    .select("component_type, ingredient_id, component_semi_finished_id, qty")
    .eq("business_id", businessId)
    .eq("semi_finished_item_id", semiFinishedItemId);

  if (!recipeRows || recipeRows.length === 0) {
    return { error: "Bahan setengah jadi ini belum punya resep/komponen.", warnings };
  }

  let totalCost = 0;
  const consumptions: { ingredientId: string; name: string; unit: string; stockBefore: number; needed: number }[] = [];

  for (const row of recipeRows) {
    const needed = Number(row.qty) * produceQty;

    if (row.component_type === "ingredient" && row.ingredient_id) {
      const { data: ing } = await supabase
        .from("ingredients")
        .select("id, name, unit, stock, unit_cost")
        .eq("id", row.ingredient_id)
        .single();
      if (!ing) continue;
      totalCost += needed * Number(ing.unit_cost);
      consumptions.push({ ingredientId: ing.id, name: ing.name, unit: ing.unit, stockBefore: Number(ing.stock), needed });
    } else if (row.component_type === "semi_finished" && row.component_semi_finished_id) {
      const { data: child } = await supabase
        .from("semi_finished_items")
        .select("id, name, ingredient_id")
        .eq("id", row.component_semi_finished_id)
        .single();
      if (!child?.ingredient_id) {
        warnings.push(`Komponen "${child?.name ?? "?"}" (BSJ bersarang) dilewati -- belum didukung di produksi flat.`);
        continue;
      }
      const { data: childMirror } = await supabase
        .from("ingredients")
        .select("id, name, unit, stock, unit_cost")
        .eq("id", child.ingredient_id)
        .single();
      if (!childMirror) continue;
      totalCost += needed * Number(childMirror.unit_cost);
      consumptions.push({
        ingredientId: childMirror.id,
        name: childMirror.name,
        unit: childMirror.unit,
        stockBefore: Number(childMirror.stock),
        needed,
      });
    }
  }

  for (const c of consumptions) {
    const stockAfter = Math.max(0, c.stockBefore - c.needed);
    await supabase.from("ingredients").update({ stock: stockAfter }).eq("id", c.ingredientId);
    await supabase.from("stock_adjustments").insert({
      business_id: businessId,
      ingredient_id: c.ingredientId,
      item_name: c.name,
      unit: c.unit,
      stock_before: c.stockBefore,
      stock_after: stockAfter,
      diff: stockAfter - c.stockBefore,
      reason: `Produksi ${item.name}`,
    });
    if (stockAfter === 0 && c.stockBefore < c.needed) {
      warnings.push(`Stok "${c.name}" tidak cukup (kurang ${c.needed - c.stockBefore} ${c.unit}), tetap diproses sampai 0.`);
    }
  }

  const { data: mirror } = await supabase
    .from("ingredients")
    .select("id, stock, unit_cost")
    .eq("id", item.ingredient_id)
    .single();
  if (!mirror) return { error: "Kembaran bahan baku tidak ditemukan.", warnings };

  const stockBeforeItem = Number(mirror.stock);
  const newStock = stockBeforeItem + produceQty;

  let newUnitCost = Number(mirror.unit_cost);
  if (item.manual_unit_cost == null) {
    // Rata-rata tertimbang, sama pola dengan pembelian (finance/actions.ts
    // addExpense) -- bukan overwrite mentah, supaya stok lama & baru sama-
    // sama terhitung wajar.
    const oldValue = stockBeforeItem * Number(mirror.unit_cost);
    newUnitCost = newStock > 0 ? Math.round((oldValue + totalCost) / newStock) : Number(mirror.unit_cost);
  }

  await supabase.from("ingredients").update({ stock: newStock, unit_cost: newUnitCost }).eq("id", item.ingredient_id);
  await supabase.from("semi_finished_items").update({ stock: newStock }).eq("id", item.id);

  if (newUnitCost !== Number(mirror.unit_cost)) {
    await supabase.from("ingredient_price_history").insert({
      business_id: businessId,
      ingredient_id: item.ingredient_id,
      unit_cost: newUnitCost,
      source: "produksi",
    });
    await recalculateProductCostsForIngredient(supabase, item.ingredient_id);
  }

  await supabase.from("stock_adjustments").insert({
    business_id: businessId,
    ingredient_id: item.ingredient_id,
    item_name: item.name,
    unit: item.unit,
    stock_before: stockBeforeItem,
    stock_after: newStock,
    diff: produceQty,
    reason: "Hasil Produksi",
  });

  return { error: null, warnings };
}
