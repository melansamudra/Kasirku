import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// BOM bahan setengah jadi boleh berjenjang (A pakai B, B pakai C). Siklus
// tidak langsung (A pakai B, B pakai A) tidak bisa dicegah lewat constraint
// SQL biasa — divalidasi juga di addRecipeComponent, tapi kalau ada yang
// lolos (mis. race condition atau data lama), resolver ini melempar error
// alih-alih infinite loop.
export class CostCycleError extends Error {}

export type CostBreakdownLine = {
  componentType: "ingredient" | "semi_finished";
  id: string;
  name: string;
  qty: number;
  unit: string;
  unitCost: number;
  subtotal: number;
  // Hanya ada kalau componentType === "semi_finished" — breakdown resep
  // komponen itu sendiri, untuk ditampilkan sebagai pohon biaya.
  children?: CostBreakdownLine[];
};

export type CostResult = { unitCost: number; breakdown: CostBreakdownLine[] };

type IngredientRow = { id: string; name: string; unit: string; unit_cost: number };
type SemiFinishedRow = { id: string; name: string; unit: string };
type SemiFinishedRecipeRow = {
  semi_finished_item_id: string;
  component_type: "ingredient" | "semi_finished";
  ingredient_id: string | null;
  component_semi_finished_id: string | null;
  qty: number;
  unit: string;
};
type FinishedRecipeRow = {
  finished_product_id: string;
  component_type: "ingredient" | "semi_finished";
  ingredient_id: string | null;
  semi_finished_item_id: string | null;
  qty: number;
  unit: string;
};

type CostGraph = {
  ingredientMap: Map<string, IngredientRow>;
  itemMap: Map<string, SemiFinishedRow>;
  recipesByItem: Map<string, SemiFinishedRecipeRow[]>;
};

// Semua bahan baku + bahan setengah jadi + resep bahan setengah jadi milik
// satu business, diambil SEKALI lalu dipakai untuk resolve berapa pun item —
// menghindari N round-trip DB saat menghitung HPP banyak item sekaligus
// (mis. halaman list).
async function loadCostGraph(supabase: SupabaseServerClient, businessId: string): Promise<CostGraph> {
  const [{ data: ingredients }, { data: items }, { data: recipes }] = await Promise.all([
    supabase
      .from("ingredients")
      .select("id, name, unit, unit_cost")
      .eq("business_id", businessId)
      .is("deleted_at", null),
    supabase
      .from("semi_finished_items")
      .select("id, name, unit")
      .eq("business_id", businessId)
      .is("deleted_at", null),
    supabase
      .from("semi_finished_recipes")
      .select("semi_finished_item_id, component_type, ingredient_id, component_semi_finished_id, qty, unit")
      .eq("business_id", businessId),
  ]);

  const ingredientMap = new Map((ingredients ?? []).map((row) => [row.id, row as IngredientRow]));
  const itemMap = new Map((items ?? []).map((row) => [row.id, row as SemiFinishedRow]));

  const recipesByItem = new Map<string, SemiFinishedRecipeRow[]>();
  for (const row of (recipes ?? []) as SemiFinishedRecipeRow[]) {
    const list = recipesByItem.get(row.semi_finished_item_id) ?? [];
    list.push(row);
    recipesByItem.set(row.semi_finished_item_id, list);
  }

  return { ingredientMap, itemMap, recipesByItem };
}

function resolveSemiFinished(
  itemId: string,
  graph: CostGraph,
  memo: Map<string, CostResult>,
  visiting: Set<string>,
): CostResult {
  const cached = memo.get(itemId);
  if (cached) return cached;

  if (visiting.has(itemId)) {
    const name = graph.itemMap.get(itemId)?.name ?? itemId;
    throw new CostCycleError(`Siklus BOM terdeteksi pada bahan setengah jadi "${name}"`);
  }
  visiting.add(itemId);

  const lines = graph.recipesByItem.get(itemId) ?? [];
  const breakdown: CostBreakdownLine[] = [];
  let unitCost = 0;

  for (const line of lines) {
    const qty = Number(line.qty);

    if (line.component_type === "ingredient" && line.ingredient_id) {
      const ingredient = graph.ingredientMap.get(line.ingredient_id);
      const componentUnitCost = Number(ingredient?.unit_cost ?? 0);
      const subtotal = componentUnitCost * qty;
      unitCost += subtotal;
      breakdown.push({
        componentType: "ingredient",
        id: line.ingredient_id,
        name: ingredient?.name ?? "(bahan baku dihapus)",
        qty,
        unit: line.unit,
        unitCost: componentUnitCost,
        subtotal,
      });
    } else if (line.component_type === "semi_finished" && line.component_semi_finished_id) {
      const child = resolveSemiFinished(line.component_semi_finished_id, graph, memo, visiting);
      const subtotal = child.unitCost * qty;
      unitCost += subtotal;
      breakdown.push({
        componentType: "semi_finished",
        id: line.component_semi_finished_id,
        name: graph.itemMap.get(line.component_semi_finished_id)?.name ?? "(bahan setengah jadi dihapus)",
        qty,
        unit: line.unit,
        unitCost: child.unitCost,
        subtotal,
        children: child.breakdown,
      });
    }
  }

  visiting.delete(itemId);
  const result: CostResult = { unitCost, breakdown };
  memo.set(itemId, result);
  return result;
}

// HPP live satu bahan setengah jadi, per 1 unit output-nya, dihitung
// rekursif dari resepnya saat ini. `breakdown` yang dikembalikan adalah
// baris-baris komponen LANGSUNG (level 1) milik item ini — dipakai juga oleh
// recordProductionRun untuk snapshot konsumsi per komponen.
export async function computeSemiFinishedItemCost(
  supabase: SupabaseServerClient,
  businessId: string,
  semiFinishedItemId: string,
): Promise<CostResult> {
  const graph = await loadCostGraph(supabase, businessId);
  return resolveSemiFinished(semiFinishedItemId, graph, new Map(), new Set());
}

// Varian batch untuk halaman list (semi-finished-items) — satu fetch untuk
// semua item, bukan N query terpisah.
export async function computeAllSemiFinishedItemCosts(
  supabase: SupabaseServerClient,
  businessId: string,
): Promise<Map<string, CostResult>> {
  const graph = await loadCostGraph(supabase, businessId);
  const memo = new Map<string, CostResult>();
  for (const id of graph.itemMap.keys()) {
    resolveSemiFinished(id, graph, memo, new Set());
  }
  return memo;
}

async function resolveFinishedProductRows(
  supabase: SupabaseServerClient,
  businessId: string,
  graph: CostGraph,
  semiMemo: Map<string, CostResult>,
  rows: FinishedRecipeRow[],
): Promise<CostResult> {
  const breakdown: CostBreakdownLine[] = [];
  let unitCost = 0;

  for (const line of rows) {
    const qty = Number(line.qty);

    if (line.component_type === "ingredient" && line.ingredient_id) {
      const ingredient = graph.ingredientMap.get(line.ingredient_id);
      const componentUnitCost = Number(ingredient?.unit_cost ?? 0);
      const subtotal = componentUnitCost * qty;
      unitCost += subtotal;
      breakdown.push({
        componentType: "ingredient",
        id: line.ingredient_id,
        name: ingredient?.name ?? "(bahan baku dihapus)",
        qty,
        unit: line.unit,
        unitCost: componentUnitCost,
        subtotal,
      });
    } else if (line.component_type === "semi_finished" && line.semi_finished_item_id) {
      const child = resolveSemiFinished(line.semi_finished_item_id, graph, semiMemo, new Set());
      const subtotal = child.unitCost * qty;
      unitCost += subtotal;
      breakdown.push({
        componentType: "semi_finished",
        id: line.semi_finished_item_id,
        name: graph.itemMap.get(line.semi_finished_item_id)?.name ?? "(bahan setengah jadi dihapus)",
        qty,
        unit: line.unit,
        unitCost: child.unitCost,
        subtotal,
        children: child.breakdown,
      });
    }
  }

  return { unitCost, breakdown };
}

// HPP live satu produk jadi, per 1 unit. Cabang semi_finished dihitung lewat
// resolveSemiFinished (rekursif, guard siklus sama).
export async function computeFinishedProductCost(
  supabase: SupabaseServerClient,
  businessId: string,
  finishedProductId: string,
): Promise<CostResult> {
  const graph = await loadCostGraph(supabase, businessId);
  const { data: recipeRows } = await supabase
    .from("finished_product_recipes")
    .select("finished_product_id, component_type, ingredient_id, semi_finished_item_id, qty, unit")
    .eq("business_id", businessId)
    .eq("finished_product_id", finishedProductId);

  return resolveFinishedProductRows(
    supabase,
    businessId,
    graph,
    new Map(),
    (recipeRows ?? []) as FinishedRecipeRow[],
  );
}

// Varian batch untuk halaman list (finished-products).
export async function computeAllFinishedProductCosts(
  supabase: SupabaseServerClient,
  businessId: string,
): Promise<Map<string, CostResult>> {
  const graph = await loadCostGraph(supabase, businessId);
  const { data: recipeRows } = await supabase
    .from("finished_product_recipes")
    .select("finished_product_id, component_type, ingredient_id, semi_finished_item_id, qty, unit")
    .eq("business_id", businessId);

  const rowsByProduct = new Map<string, FinishedRecipeRow[]>();
  for (const row of (recipeRows ?? []) as FinishedRecipeRow[]) {
    const list = rowsByProduct.get(row.finished_product_id) ?? [];
    list.push(row);
    rowsByProduct.set(row.finished_product_id, list);
  }

  const semiMemo = new Map<string, CostResult>();
  const results = new Map<string, CostResult>();
  for (const [productId, rows] of rowsByProduct) {
    results.set(productId, await resolveFinishedProductRows(supabase, businessId, graph, semiMemo, rows));
  }
  return results;
}

// Deteksi siklus TRANSITIF sebelum sebuah baris resep baru disimpan (mis.
// user coba bikin A pakai B padahal B (langsung/tidak langsung) sudah pakai
// A) — dipanggil dari addRecipeComponent sebelum insert. `newComponentId`
// adalah calon komponen baru yang mau ditambahkan ke resep `targetItemId`.
export async function wouldCreateCycle(
  supabase: SupabaseServerClient,
  businessId: string,
  targetItemId: string,
  newComponentId: string,
): Promise<boolean> {
  if (targetItemId === newComponentId) return true;

  const graph = await loadCostGraph(supabase, businessId);
  const seen = new Set<string>();
  const stack = [newComponentId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === targetItemId) return true;
    if (seen.has(current)) continue;
    seen.add(current);

    const lines = graph.recipesByItem.get(current) ?? [];
    for (const line of lines) {
      if (line.component_type === "semi_finished" && line.component_semi_finished_id) {
        stack.push(line.component_semi_finished_id);
      }
    }
  }

  return false;
}
