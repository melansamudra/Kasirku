import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { loadCostGraph, type CostGraph, type FinishedRecipeRow } from "./compute-cost";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Turunkan qty butuh sampai ke bahan baku murni. Sama pola rekursif dengan
// resolveSemiFinished di compute-cost.ts (guard siklus `visiting`), bedanya
// di sini AKUMULASI QTY per bahan baku, bukan biaya.
function accumulateIngredientUsage(
  componentType: "ingredient" | "semi_finished",
  ingredientId: string | null,
  semiFinishedItemId: string | null,
  qtyNeeded: number,
  graph: CostGraph,
  usage: Map<string, number>,
  visiting: Set<string>,
) {
  if (componentType === "ingredient" && ingredientId) {
    usage.set(ingredientId, (usage.get(ingredientId) ?? 0) + qtyNeeded);
    return;
  }
  if (componentType === "semi_finished" && semiFinishedItemId) {
    if (visiting.has(semiFinishedItemId)) return; // siklus -- jangan infinite loop, sama guard compute-cost.ts
    visiting.add(semiFinishedItemId);
    const lines = graph.recipesByItem.get(semiFinishedItemId) ?? [];
    for (const line of lines) {
      const childQtyNeeded = Number(line.qty) * qtyNeeded;
      accumulateIngredientUsage(
        line.component_type,
        line.ingredient_id,
        line.component_semi_finished_id,
        childQtyNeeded,
        graph,
        usage,
        visiting,
      );
    }
    visiting.delete(semiFinishedItemId);
  }
}

// RAB Pembelian: pakai penjualan produk jadi bulan acuan x resepnya (HPP)
// untuk hitung berapa banyak tiap BAHAN BAKU murni yang kepakai -- turun
// lewat semi_finished_recipes berlapis sampai habis, sama seperti kalkulasi
// HPP live, cuma akumulasi qty bukan biaya. Dipakai sebagai ACUAN (bukan
// otomatis jadi order_qty) di halaman RAB Pembelian.
export async function computeIngredientUsageFromSales(
  supabase: SupabaseServerClient,
  businessId: string,
  salesQtyByFinishedProductId: Map<string, number>,
): Promise<Map<string, number>> {
  const usage = new Map<string, number>();
  if (salesQtyByFinishedProductId.size === 0) return usage;

  const graph = await loadCostGraph(supabase, businessId);

  const finishedProductIds = [...salesQtyByFinishedProductId.keys()];
  const recipeRows = (await fetchAllRows<{
    finished_product_id: string;
    component_type: string;
    ingredient_id: string | null;
    semi_finished_item_id: string | null;
    qty: number;
    unit: string;
  }>((from, to) =>
    supabase
      .from("finished_product_recipes")
      .select("finished_product_id, component_type, ingredient_id, semi_finished_item_id, qty, unit")
      .eq("business_id", businessId)
      .in("finished_product_id", finishedProductIds)
      .range(from, to),
  )) as FinishedRecipeRow[];

  const recipesByProduct = new Map<string, FinishedRecipeRow[]>();
  for (const row of recipeRows) {
    const list = recipesByProduct.get(row.finished_product_id) ?? [];
    list.push(row);
    recipesByProduct.set(row.finished_product_id, list);
  }

  for (const [finishedProductId, qtySold] of salesQtyByFinishedProductId) {
    const lines = recipesByProduct.get(finishedProductId) ?? [];
    for (const line of lines) {
      const qtyNeeded = Number(line.qty) * qtySold;
      accumulateIngredientUsage(
        line.component_type,
        line.ingredient_id,
        line.semi_finished_item_id,
        qtyNeeded,
        graph,
        usage,
        new Set(),
      );
    }
  }

  return usage;
}
