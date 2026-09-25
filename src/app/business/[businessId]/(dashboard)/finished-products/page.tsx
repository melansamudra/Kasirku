import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { computeAllFinishedProductCosts } from "@/lib/cost-control/compute-cost";
import {
  addFinishedProduct,
  adjustFinishedProductsPriceBulk,
  deleteFinishedProductsBulk,
  updateFinishedProductsCategoryBulk,
} from "./actions";
import ProductForm from "./product-form";
import FinishedProductsList, { type FinishedProductRow } from "./product-list";
import type { BulkAction } from "@/components/bulk-action-bar";

export default async function FinishedProductsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, rich_stock_ops_enabled")
    .eq("id", businessId)
    .single();

  if (!business || !(business.cost_control_enabled || business.rich_stock_ops_enabled)) {
    notFound();
  }

  const { data: products } = await supabase
    .from("finished_products")
    .select("id, name, category, selling_price, fluctuation_pct, target_food_cost_pct")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  const productIds = (products ?? []).map((p) => p.id);

  const [costs, ingredients, semiFinishedItems, recipeRows] = await Promise.all([
    computeAllFinishedProductCosts(supabase, businessId),
    fetchAllRows<{ id: string; name: string; unit: string }>((from, to) =>
      supabase
        .from("ingredients")
        .select("id, name, unit")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<{ id: string; name: string; unit: string }>((from, to) =>
      supabase
        .from("semi_finished_items")
        .select("id, name, unit")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .order("name", { ascending: true })
        .range(from, to),
    ),
    productIds.length
      ? fetchAllRows<{
          id: string;
          finished_product_id: string;
          component_type: string;
          ingredient_id: string | null;
          semi_finished_item_id: string | null;
          qty: number;
          unit: string;
        }>((from, to) =>
          supabase
            .from("finished_product_recipes")
            .select("id, finished_product_id, component_type, ingredient_id, semi_finished_item_id, qty, unit")
            .eq("business_id", businessId)
            .in("finished_product_id", productIds)
            .range(from, to),
        )
      : Promise.resolve([]),
  ]);

  const ingredientNameById = new Map(ingredients.map((i) => [i.id, i.name]));
  const semiNameById = new Map(semiFinishedItems.map((s) => [s.id, s.name]));

  const recipeLinesByProduct = new Map<
    string,
    { id: string; name: string; qty: number; unit: string }[]
  >();
  for (const r of recipeRows) {
    const name =
      r.component_type === "ingredient"
        ? (ingredientNameById.get(r.ingredient_id ?? "") ?? "(dihapus)")
        : (semiNameById.get(r.semi_finished_item_id ?? "") ?? "(dihapus)");
    const list = recipeLinesByProduct.get(r.finished_product_id) ?? [];
    list.push({ id: r.id, name, qty: Number(r.qty), unit: r.unit });
    recipeLinesByProduct.set(r.finished_product_id, list);
  }

  const boundAddProduct = addFinishedProduct.bind(null, businessId);

  const boundDeleteBulk = deleteFinishedProductsBulk.bind(null, businessId);
  const boundUpdateCategoryBulk = updateFinishedProductsCategoryBulk.bind(null, businessId);
  const boundAdjustPriceBulk = adjustFinishedProductsPriceBulk.bind(null, businessId);

  const finishedProductBulkActions: BulkAction[] = [
    {
      key: "delete",
      label: "Hapus Terpilih",
      kind: "delete",
      confirmLabel: "Hapus produk jadi yang dipilih?",
      run: boundDeleteBulk,
    },
    {
      key: "category",
      label: "Ubah Kategori",
      kind: "text",
      fieldLabel: "Kategori baru",
      placeholder: "mis. Makanan Berat",
      run: boundUpdateCategoryBulk,
    },
    {
      key: "adjust-price",
      label: "Sesuaikan Harga Jual %",
      kind: "percent",
      fieldLabel: "Ubah harga jual sebesar",
      run: boundAdjustPriceBulk,
    },
  ];

  const rows: FinishedProductRow[] = (products ?? []).map((product) => {
    const cost = costs.get(product.id);
    const hpp = cost?.unitCost ?? 0;
    const suggestedPrice =
      product.target_food_cost_pct != null && product.target_food_cost_pct > 0
        ? hpp / (product.target_food_cost_pct / 100)
        : null;
    const effectivePrice = product.selling_price ?? suggestedPrice;
    const margin = effectivePrice != null ? effectivePrice - hpp : null;
    const marginPct = margin != null && effectivePrice ? Math.round((margin / effectivePrice) * 100) : null;
    return {
      id: product.id,
      name: product.name,
      category: product.category,
      hpp,
      effectivePrice,
      isSuggestedPrice: product.selling_price == null && suggestedPrice != null,
      marginPct,
      sellingPrice: product.selling_price,
      fluctuationPct: Number(product.fluctuation_pct ?? 0),
      targetFoodCostPct: product.target_food_cost_pct,
      breakdown: cost?.breakdown ?? [],
      rawCost: cost?.rawCost ?? 0,
      recipeLines: recipeLinesByProduct.get(product.id) ?? [],
    };
  });

  return (
    <div className="w-full max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Produk Jadi (HPP) — {business.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Untuk kontrol biaya &amp; margin saja — produk ini <b>tidak dijual lewat POS Kasirku</b>.
            HPP dihitung otomatis dari resep (bahan setengah jadi + bahan baku).
          </p>
        </div>
        <Link
          href={`/business/${businessId}/finished-products/import`}
          className="shrink-0 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100"
        >
          Import dari Data Excel
        </Link>
      </div>

      <div className="mt-6">
        <FinishedProductsList
          businessId={businessId}
          products={rows}
          bulkActions={finishedProductBulkActions}
          ingredients={ingredients}
          semiFinishedOptions={semiFinishedItems}
        />
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Tambah Produk Jadi</h2>
        <ProductForm action={boundAddProduct} submitLabel="+ Tambah Produk Jadi" />
      </div>
    </div>
  );
}
