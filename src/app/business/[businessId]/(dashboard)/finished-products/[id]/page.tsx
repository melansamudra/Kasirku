import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeFinishedProductCost, type CostBreakdownLine } from "@/lib/cost-control/compute-cost";
import { addRecipeComponent, removeRecipeComponent, updateFinishedProduct } from "../actions";
import ProductForm from "../product-form";
import RecipeEditor from "../recipe-editor";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatQty(value: number) {
  return Number(value.toFixed(4)).toLocaleString("id-ID");
}

function BreakdownRow({ line, depth }: { line: CostBreakdownLine; depth: number }) {
  return (
    <>
      <tr>
        <td className="px-3 py-2" style={{ paddingLeft: `${12 + depth * 16}px` }}>
          {line.name}
          {line.componentType === "semi_finished" && (
            <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">
              setengah jadi
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          {formatQty(line.qty)} {line.unit}
        </td>
        <td className="px-3 py-2 text-right">{formatRupiah(line.subtotal)}</td>
      </tr>
      {line.children?.map((child, i) => (
        <BreakdownRow key={i} line={child} depth={depth + 1} />
      ))}
    </>
  );
}

export default async function FinishedProductDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; id: string }>;
}) {
  const { businessId, id } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, rich_stock_ops_enabled")
    .eq("id", businessId)
    .single();

  if (!business || !(business.cost_control_enabled || business.rich_stock_ops_enabled)) {
    notFound();
  }

  const { data: product } = await supabase
    .from("finished_products")
    .select("id, name, category, selling_price, fluctuation_pct, target_food_cost_pct")
    .eq("id", id)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!product) {
    notFound();
  }

  const [{ data: recipeRows }, { data: ingredients }, { data: semiFinishedItems }] = await Promise.all([
    supabase
      .from("finished_product_recipes")
      .select("id, component_type, ingredient_id, semi_finished_item_id, qty, unit")
      .eq("business_id", businessId)
      .eq("finished_product_id", id),
    supabase
      .from("ingredients")
      .select("id, name, unit")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("semi_finished_items")
      .select("id, name, unit")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
  ]);

  const ingredientMap = new Map((ingredients ?? []).map((i) => [i.id, i]));
  const itemMap = new Map((semiFinishedItems ?? []).map((i) => [i.id, i]));

  const cost = await computeFinishedProductCost(supabase, businessId, id);
  const margin = product.selling_price != null ? product.selling_price - cost.unitCost : null;
  const suggestedPrice =
    product.target_food_cost_pct != null && product.target_food_cost_pct > 0
      ? cost.unitCost / (product.target_food_cost_pct / 100)
      : null;

  const boundUpdate = updateFinishedProduct.bind(null, businessId, id);
  const boundAddComponent = addRecipeComponent.bind(null, businessId, id);

  return (
    <div className="w-full max-w-3xl">
      <Link
        href={`/business/${businessId}/finished-products`}
        className="text-xs text-zinc-400 hover:text-brand-600"
      >
        ← Kembali ke Produk Jadi
      </Link>
      <h1 className="mt-2 text-lg font-bold text-zinc-900">{product.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        HPP live <span className="font-semibold text-zinc-700">{formatRupiah(cost.unitCost)}</span>
        {product.selling_price != null && margin != null && (
          <>
            {" "}
            · Harga jual {formatRupiah(product.selling_price)} · Margin{" "}
            <span className={margin >= 0 ? "text-emerald-600" : "text-red-600"}>{formatRupiah(margin)}</span>
          </>
        )}
      </p>
      {suggestedPrice != null && (
        <p className="mt-1 text-xs text-zinc-400">
          Saran harga jual (food cost {product.target_food_cost_pct}%):{" "}
          <span className="font-medium text-zinc-600">{formatRupiah(suggestedPrice)}</span>
        </p>
      )}

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Resep (per 1 unit)</h2>

        {cost.breakdown.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">Komponen</th>
                  <th className="px-3 py-2 text-right">Jumlah</th>
                  <th className="px-3 py-2 text-right">Biaya</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {cost.breakdown.map((line, i) => (
                  <BreakdownRow key={i} line={line} depth={0} />
                ))}
              </tbody>
              <tfoot className="bg-zinc-50">
                <tr>
                  <td colSpan={2} className="px-3 py-2 text-right text-xs text-zinc-500">
                    Sub total
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-zinc-600">{formatRupiah(cost.rawCost)}</td>
                </tr>
                {cost.fluctuationPct > 0 && (
                  <tr>
                    <td colSpan={2} className="px-3 py-2 text-right text-xs text-zinc-500">
                      Fluctuation ({cost.fluctuationPct}%)
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-zinc-600">
                      {formatRupiah(cost.unitCost - cost.rawCost)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td colSpan={2} className="px-3 py-2 text-right text-xs font-semibold text-zinc-600">
                    Total HPP per unit
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-bold text-zinc-900">
                    {formatRupiah(cost.unitCost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada komponen resep — HPP masih Rp0.
          </p>
        )}

        {(recipeRows ?? []).length > 0 && (
          <div className="mt-4 space-y-1.5">
            {(recipeRows ?? []).map((line) => {
              const name =
                line.component_type === "ingredient"
                  ? ingredientMap.get(line.ingredient_id ?? "")?.name
                  : itemMap.get(line.semi_finished_item_id ?? "")?.name;
              return (
                <div
                  key={line.id}
                  className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600"
                >
                  <span>
                    {name ?? "(dihapus)"} — {formatQty(line.qty)} {line.unit}
                  </span>
                  <form action={removeRecipeComponent.bind(null, businessId, id, line.id)}>
                    <button type="submit" className="text-zinc-400 hover:text-red-500" title="Hapus komponen">
                      Hapus
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 border-t border-zinc-100 pt-4">
          <RecipeEditor
            action={boundAddComponent}
            ingredients={ingredients ?? []}
            semiFinishedOptions={semiFinishedItems ?? []}
          />
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Ubah Data</h2>
        <ProductForm
          action={boundUpdate}
          defaultValues={{
            name: product.name,
            category: product.category,
            sellingPrice: product.selling_price,
            fluctuationPct: product.fluctuation_pct,
            targetFoodCostPct: product.target_food_cost_pct,
          }}
          submitLabel="Simpan Perubahan"
          resetOnSuccess={false}
        />
      </div>
    </div>
  );
}
