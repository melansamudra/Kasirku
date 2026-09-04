import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";

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

// `unitCost` sudah termasuk buffer fluctuation (dipakai di semua tempat lain
// — konsumsi produksi, biaya komponen di resep parent, dst). `rawCost` &
// `fluctuationPct` disimpan terpisah murni untuk transparansi tampilan
// (breakdown "Sub total → Fluctuation → Total" persis seperti kartu resep
// Excel yang jadi acuan Lauk Nusantara).
export type CostResult = {
  unitCost: number;
  rawCost: number;
  fluctuationPct: number;
  breakdown: CostBreakdownLine[];
};

export type IngredientRow = { id: string; name: string; unit: string; unit_cost: number };
export type SemiFinishedRow = {
  id: string;
  name: string;
  unit: string;
  fluctuation_pct: number;
  manual_unit_cost: number | null;
};
export type SemiFinishedRecipeRow = {
  semi_finished_item_id: string;
  component_type: "ingredient" | "semi_finished";
  ingredient_id: string | null;
  component_semi_finished_id: string | null;
  qty: number;
  unit: string;
};
export type FinishedRecipeRow = {
  finished_product_id: string;
  component_type: "ingredient" | "semi_finished";
  ingredient_id: string | null;
  semi_finished_item_id: string | null;
  qty: number;
  unit: string;
};

export type CostGraph = {
  ingredientMap: Map<string, IngredientRow>;
  itemMap: Map<string, SemiFinishedRow>;
  recipesByItem: Map<string, SemiFinishedRecipeRow[]>;
};

// Semua bahan baku + bahan setengah jadi + resep bahan setengah jadi milik
// satu business, diambil SEKALI lalu dipakai untuk resolve berapa pun item —
// menghindari N round-trip DB saat menghitung HPP banyak item sekaligus
// (mis. halaman list).
//
// fetchAllRows (bukan .select() polos) -- Supabase/PostgREST diam-diam
// memotong select tanpa .range() ke Max Rows API (default 1000). Llauk
// Nusantara sudah 867 ingredients & 1252 semi_finished_recipes -- resep yang
// paling baru dibuat (mis. Saos Mayonase) kepotong dari hasil select polos,
// bikin HPP-nya kehitung 0/kosong padahal resepnya sudah tersimpan lengkap.
// Sama pola dengan fix bug 1000-row di halaman akuntansi/reports.
// Diekspor (bukan cuma dipakai internal file ini) supaya compute-usage.ts
// (RAB dari penjualan x resep) bisa pakai graph BOM semi-finished yang sama
// tanpa duplikasi query.
export async function loadCostGraph(supabase: SupabaseServerClient, businessId: string): Promise<CostGraph> {
  const [ingredients, items, recipes] = await Promise.all([
    fetchAllRows<IngredientRow>((from, to) =>
      supabase
        .from("ingredients")
        .select("id, name, unit, unit_cost")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .range(from, to),
    ),
    fetchAllRows<SemiFinishedRow>((from, to) =>
      supabase
        .from("semi_finished_items")
        .select("id, name, unit, fluctuation_pct, manual_unit_cost")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .range(from, to),
    ),
    fetchAllRows<{
      semi_finished_item_id: string;
      component_type: string;
      ingredient_id: string | null;
      component_semi_finished_id: string | null;
      qty: number;
      unit: string;
    }>((from, to) =>
      supabase
        .from("semi_finished_recipes")
        .select("semi_finished_item_id, component_type, ingredient_id, component_semi_finished_id, qty, unit")
        .eq("business_id", businessId)
        .range(from, to),
    ) as Promise<SemiFinishedRecipeRow[]>,
  ]);

  const ingredientMap = new Map(ingredients.map((row) => [row.id, row]));
  const itemMap = new Map(items.map((row) => [row.id, row]));

  const recipesByItem = new Map<string, SemiFinishedRecipeRow[]>();
  for (const row of recipes) {
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

  // HPP manual -- kalau diisi, dipakai LANGSUNG sebagai HPP final, resep &
  // fluctuation di-skip total (tidak masuk `visiting` karena tidak pernah
  // rekursi ke komponen apa pun).
  const manualCost = graph.itemMap.get(itemId)?.manual_unit_cost;
  if (manualCost !== null && manualCost !== undefined) {
    const result: CostResult = { unitCost: Number(manualCost), rawCost: Number(manualCost), fluctuationPct: 0, breakdown: [] };
    memo.set(itemId, result);
    return result;
  }

  if (visiting.has(itemId)) {
    const name = graph.itemMap.get(itemId)?.name ?? itemId;
    throw new CostCycleError(`Siklus BOM terdeteksi pada bahan setengah jadi "${name}"`);
  }
  visiting.add(itemId);

  const lines = graph.recipesByItem.get(itemId) ?? [];
  const breakdown: CostBreakdownLine[] = [];
  let rawCost = 0;

  for (const line of lines) {
    const qty = Number(line.qty);

    if (line.component_type === "ingredient" && line.ingredient_id) {
      const ingredient = graph.ingredientMap.get(line.ingredient_id);
      const componentUnitCost = Number(ingredient?.unit_cost ?? 0);
      const subtotal = componentUnitCost * qty;
      rawCost += subtotal;
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
      rawCost += subtotal;
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
  const fluctuationPct = Number(graph.itemMap.get(itemId)?.fluctuation_pct ?? 0);
  const unitCost = rawCost * (1 + fluctuationPct / 100);
  const result: CostResult = { unitCost, rawCost, fluctuationPct, breakdown };
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
  fluctuationPct: number,
): Promise<CostResult> {
  const breakdown: CostBreakdownLine[] = [];
  let rawCost = 0;

  for (const line of rows) {
    const qty = Number(line.qty);

    if (line.component_type === "ingredient" && line.ingredient_id) {
      const ingredient = graph.ingredientMap.get(line.ingredient_id);
      const componentUnitCost = Number(ingredient?.unit_cost ?? 0);
      const subtotal = componentUnitCost * qty;
      rawCost += subtotal;
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
      rawCost += subtotal;
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

  const unitCost = rawCost * (1 + fluctuationPct / 100);
  return { unitCost, rawCost, fluctuationPct, breakdown };
}

// HPP live satu produk jadi, per 1 unit. Cabang semi_finished dihitung lewat
// resolveSemiFinished (rekursif, guard siklus sama).
export async function computeFinishedProductCost(
  supabase: SupabaseServerClient,
  businessId: string,
  finishedProductId: string,
): Promise<CostResult> {
  const graph = await loadCostGraph(supabase, businessId);
  const [{ data: recipeRows }, { data: product }] = await Promise.all([
    supabase
      .from("finished_product_recipes")
      .select("finished_product_id, component_type, ingredient_id, semi_finished_item_id, qty, unit")
      .eq("business_id", businessId)
      .eq("finished_product_id", finishedProductId),
    supabase
      .from("finished_products")
      .select("fluctuation_pct")
      .eq("id", finishedProductId)
      .eq("business_id", businessId)
      .maybeSingle(),
  ]);

  return resolveFinishedProductRows(
    supabase,
    businessId,
    graph,
    new Map(),
    (recipeRows ?? []) as FinishedRecipeRow[],
    Number(product?.fluctuation_pct ?? 0),
  );
}

// Varian batch untuk halaman list (finished-products).
export async function computeAllFinishedProductCosts(
  supabase: SupabaseServerClient,
  businessId: string,
): Promise<Map<string, CostResult>> {
  const graph = await loadCostGraph(supabase, businessId);
  const [recipeRows, products] = await Promise.all([
    fetchAllRows<{
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
        .range(from, to),
    ) as Promise<FinishedRecipeRow[]>,
    fetchAllRows<{ id: string; fluctuation_pct: number }>((from, to) =>
      supabase.from("finished_products").select("id, fluctuation_pct").eq("business_id", businessId).range(from, to),
    ),
  ]);

  const fluctuationById = new Map(products.map((p) => [p.id, Number(p.fluctuation_pct ?? 0)]));

  const rowsByProduct = new Map<string, FinishedRecipeRow[]>();
  for (const row of recipeRows) {
    const list = rowsByProduct.get(row.finished_product_id) ?? [];
    list.push(row);
    rowsByProduct.set(row.finished_product_id, list);
  }

  const semiMemo = new Map<string, CostResult>();
  const results = new Map<string, CostResult>();
  for (const [productId, rows] of rowsByProduct) {
    results.set(
      productId,
      await resolveFinishedProductRows(supabase, businessId, graph, semiMemo, rows, fluctuationById.get(productId) ?? 0),
    );
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
