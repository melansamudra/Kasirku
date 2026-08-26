import { describe, expect, it } from "vitest";
import { computeFinishedProductCost, computeSemiFinishedItemCost, CostCycleError, wouldCreateCycle } from "./compute-cost";

type FakeTables = {
  ingredients?: Record<string, unknown>[];
  semi_finished_items?: Record<string, unknown>[];
  semi_finished_recipes?: Record<string, unknown>[];
  finished_product_recipes?: Record<string, unknown>[];
};

// Supabase client palsu yang cuma cukup untuk menjalankan chain
// .from(table).select(...).eq(...).is(...) yang dipakai compute-cost.ts, dan
// bisa di-`await` seperti query asli (thenable).
function fakeSupabase(tables: FakeTables) {
  return {
    from(table: keyof FakeTables) {
      let rows = tables[table] ?? [];
      const builder = {
        select() {
          return builder;
        },
        eq(key: string, value: unknown) {
          rows = rows.filter((row) => row[key] === value);
          return builder;
        },
        is(key: string, value: unknown) {
          rows = rows.filter((row) => row[key] === value);
          return builder;
        },
        then(resolve: (result: { data: Record<string, unknown>[]; error: null }) => void) {
          resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const BIZ = "biz-1";

describe("computeSemiFinishedItemCost", () => {
  it("menghitung HPP satu level (bahan setengah jadi dari bahan baku langsung)", async () => {
    const supabase = fakeSupabase({
      ingredients: [
        { id: "ayam", business_id: BIZ, name: "Ayam Fillet", unit: "kg", unit_cost: 38000, deleted_at: null },
        { id: "garam", business_id: BIZ, name: "Garam", unit: "kg", unit_cost: 8000, deleted_at: null },
      ],
      semi_finished_items: [{ id: "ayam-ungkep", business_id: BIZ, name: "Ayam Ungkep", unit: "kg", deleted_at: null }],
      semi_finished_recipes: [
        { semi_finished_item_id: "ayam-ungkep", business_id: BIZ, component_type: "ingredient", ingredient_id: "ayam", component_semi_finished_id: null, qty: 1, unit: "kg" },
        { semi_finished_item_id: "ayam-ungkep", business_id: BIZ, component_type: "ingredient", ingredient_id: "garam", component_semi_finished_id: null, qty: 0.01, unit: "kg" },
      ],
    });

    const result = await computeSemiFinishedItemCost(supabase, BIZ, "ayam-ungkep");

    // 1kg*38000 + 0.01kg*8000 = 38000 + 80 = 38080
    expect(result.unitCost).toBe(38080);
    expect(result.breakdown).toHaveLength(2);
  });

  it("menghitung HPP berjenjang (semi-jadi pakai semi-jadi lain)", async () => {
    const supabase = fakeSupabase({
      ingredients: [
        { id: "bawang-merah", business_id: BIZ, name: "Bawang Merah", unit: "kg", unit_cost: 32000, deleted_at: null },
        { id: "ayam", business_id: BIZ, name: "Ayam Fillet", unit: "kg", unit_cost: 38000, deleted_at: null },
      ],
      semi_finished_items: [
        { id: "bumbu-kuning", business_id: BIZ, name: "Bumbu Dasar Kuning", unit: "kg", deleted_at: null },
        { id: "ayam-ungkep", business_id: BIZ, name: "Ayam Ungkep", unit: "kg", deleted_at: null },
      ],
      semi_finished_recipes: [
        // Bumbu Dasar Kuning: 1 unit butuh 0.24kg bawang merah -> HPP 7680/kg
        { semi_finished_item_id: "bumbu-kuning", business_id: BIZ, component_type: "ingredient", ingredient_id: "bawang-merah", component_semi_finished_id: null, qty: 0.24, unit: "kg" },
        // Ayam Ungkep: 1 unit butuh 1kg ayam + 0.2kg bumbu kuning
        { semi_finished_item_id: "ayam-ungkep", business_id: BIZ, component_type: "ingredient", ingredient_id: "ayam", component_semi_finished_id: null, qty: 1, unit: "kg" },
        { semi_finished_item_id: "ayam-ungkep", business_id: BIZ, component_type: "semi_finished", ingredient_id: null, component_semi_finished_id: "bumbu-kuning", qty: 0.2, unit: "kg" },
      ],
    });

    const bumbu = await computeSemiFinishedItemCost(supabase, BIZ, "bumbu-kuning");
    expect(bumbu.unitCost).toBeCloseTo(0.24 * 32000, 5); // 7680

    const ayamUngkep = await computeSemiFinishedItemCost(supabase, BIZ, "ayam-ungkep");
    // 1*38000 + 0.2*7680 = 38000 + 1536 = 39536
    expect(ayamUngkep.unitCost).toBeCloseTo(39536, 5);
    const semiLine = ayamUngkep.breakdown.find((l) => l.componentType === "semi_finished");
    expect(semiLine?.children).toHaveLength(1);
  });

  it("melempar CostCycleError kalau resep membentuk siklus", async () => {
    const supabase = fakeSupabase({
      semi_finished_items: [
        { id: "a", business_id: BIZ, name: "A", unit: "kg", deleted_at: null },
        { id: "b", business_id: BIZ, name: "B", unit: "kg", deleted_at: null },
      ],
      semi_finished_recipes: [
        { semi_finished_item_id: "a", business_id: BIZ, component_type: "semi_finished", ingredient_id: null, component_semi_finished_id: "b", qty: 1, unit: "kg" },
        { semi_finished_item_id: "b", business_id: BIZ, component_type: "semi_finished", ingredient_id: null, component_semi_finished_id: "a", qty: 1, unit: "kg" },
      ],
    });

    await expect(computeSemiFinishedItemCost(supabase, BIZ, "a")).rejects.toBeInstanceOf(CostCycleError);
  });
});

describe("computeFinishedProductCost", () => {
  it("menghitung HPP produk jadi dari bahan baku + bahan setengah jadi", async () => {
    const supabase = fakeSupabase({
      ingredients: [{ id: "kemasan", business_id: BIZ, name: "Kemasan", unit: "pcs", unit_cost: 750, deleted_at: null }],
      semi_finished_items: [{ id: "ayam-ungkep", business_id: BIZ, name: "Ayam Ungkep", unit: "kg", deleted_at: null }],
      semi_finished_recipes: [
        { semi_finished_item_id: "ayam-ungkep", business_id: BIZ, component_type: "ingredient", ingredient_id: "kemasan", component_semi_finished_id: null, qty: 0, unit: "kg" },
      ],
      finished_product_recipes: [
        { finished_product_id: "produk-1", business_id: BIZ, component_type: "semi_finished", ingredient_id: null, semi_finished_item_id: "ayam-ungkep", qty: 0.25, unit: "kg" },
        { finished_product_id: "produk-1", business_id: BIZ, component_type: "ingredient", ingredient_id: "kemasan", semi_finished_item_id: null, qty: 1, unit: "pcs" },
      ],
    });

    // ayam-ungkep HPP disini cuma dari baris qty:0 (sengaja 0 supaya predictable) = 0
    const result = await computeFinishedProductCost(supabase, BIZ, "produk-1");
    // 0.25 * 0 (hpp ayam ungkep) + 1 * 750 (kemasan) = 750
    expect(result.unitCost).toBe(750);
  });
});

describe("wouldCreateCycle", () => {
  it("mendeteksi siklus langsung (A mau pakai A)", async () => {
    const supabase = fakeSupabase({});
    expect(await wouldCreateCycle(supabase, BIZ, "a", "a")).toBe(true);
  });

  it("mendeteksi siklus transitif (A mau pakai C, padahal C sudah pakai A lewat B)", async () => {
    const supabase = fakeSupabase({
      semi_finished_items: [
        { id: "a", business_id: BIZ, name: "A", unit: "kg", deleted_at: null },
        { id: "b", business_id: BIZ, name: "B", unit: "kg", deleted_at: null },
        { id: "c", business_id: BIZ, name: "C", unit: "kg", deleted_at: null },
      ],
      semi_finished_recipes: [
        // C sudah pakai B, B sudah pakai A -> kalau A mau nambah C sbg komponen, itu siklus
        { semi_finished_item_id: "c", business_id: BIZ, component_type: "semi_finished", ingredient_id: null, component_semi_finished_id: "b", qty: 1, unit: "kg" },
        { semi_finished_item_id: "b", business_id: BIZ, component_type: "semi_finished", ingredient_id: null, component_semi_finished_id: "a", qty: 1, unit: "kg" },
      ],
    });

    expect(await wouldCreateCycle(supabase, BIZ, "a", "c")).toBe(true);
  });

  it("tidak mendeteksi siklus untuk BOM diamond yang sah (bukan siklus)", async () => {
    const supabase = fakeSupabase({
      semi_finished_items: [
        { id: "a", business_id: BIZ, name: "A", unit: "kg", deleted_at: null },
        { id: "b", business_id: BIZ, name: "B", unit: "kg", deleted_at: null },
        { id: "c", business_id: BIZ, name: "C", unit: "kg", deleted_at: null },
      ],
      semi_finished_recipes: [
        { semi_finished_item_id: "b", business_id: BIZ, component_type: "semi_finished", ingredient_id: null, component_semi_finished_id: "c", qty: 1, unit: "kg" },
      ],
    });

    // A mau pakai B (yang pakai C) -> tidak melibatkan A sama sekali, sah.
    expect(await wouldCreateCycle(supabase, BIZ, "a", "b")).toBe(false);
  });
});
