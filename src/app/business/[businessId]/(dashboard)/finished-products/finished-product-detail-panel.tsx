"use client";

import type { CostBreakdownLine } from "@/lib/cost-control/compute-cost";
import { addRecipeComponent, removeRecipeComponent, updateFinishedProduct } from "./actions";
import ProductForm from "./product-form";
import RecipeEditor from "./recipe-editor";

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

export type FinishedProductDetail = {
  id: string;
  name: string;
  category: string | null;
  hpp: number;
  rawCost: number;
  sellingPrice: number | null;
  fluctuationPct: number;
  targetFoodCostPct: number | null;
  breakdown: CostBreakdownLine[];
  recipeLines: { id: string; name: string; qty: number; unit: string }[];
};

export default function FinishedProductDetailPanel({
  businessId,
  product,
  ingredients,
  semiFinishedOptions,
  onClose,
}: {
  businessId: string;
  product: FinishedProductDetail;
  ingredients: { id: string; name: string; unit: string }[];
  semiFinishedOptions: { id: string; name: string; unit: string }[];
  onClose: () => void;
}) {
  const margin = product.sellingPrice != null ? product.sellingPrice - product.hpp : null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-zinc-900">{product.name}</h2>
            <p className="mt-1 text-xs text-zinc-500">
              HPP <span className="font-semibold text-zinc-700">{formatRupiah(product.hpp)}</span>
              {product.sellingPrice != null && margin != null && (
                <>
                  {" "}
                  · Jual {formatRupiah(product.sellingPrice)} · Margin{" "}
                  <span className={margin >= 0 ? "text-emerald-600" : "text-red-600"}>{formatRupiah(margin)}</span>
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            title="Tutup"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-6 px-5 py-4">
          <div>
            <h3 className="mb-2 text-xs font-semibold text-zinc-900">Resep (per 1 unit)</h3>
            {product.breakdown.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-zinc-200">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Komponen</th>
                      <th className="px-3 py-2 text-right">Jumlah</th>
                      <th className="px-3 py-2 text-right">Biaya</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {product.breakdown.map((line, i) => (
                      <BreakdownRow key={i} line={line} depth={0} />
                    ))}
                  </tbody>
                  <tfoot className="bg-zinc-50">
                    <tr>
                      <td colSpan={2} className="px-3 py-2 text-right text-zinc-500">
                        Total HPP per unit
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-bold text-zinc-900">
                        {formatRupiah(product.hpp)}
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

            {product.recipeLines.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {product.recipeLines.map((line) => (
                  <div
                    key={line.id}
                    className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600"
                  >
                    <span>
                      {line.name} — {formatQty(line.qty)} {line.unit}
                    </span>
                    <form action={removeRecipeComponent.bind(null, businessId, product.id, line.id)}>
                      <button type="submit" className="text-zinc-400 hover:text-red-500" title="Hapus komponen">
                        Hapus
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3">
              <RecipeEditor
                action={addRecipeComponent.bind(null, businessId, product.id)}
                ingredients={ingredients}
                semiFinishedOptions={semiFinishedOptions}
              />
            </div>
          </div>

          <div className="border-t border-zinc-100 pt-4">
            <h3 className="mb-2 text-xs font-semibold text-zinc-900">Ubah Data</h3>
            <ProductForm
              action={updateFinishedProduct.bind(null, businessId, product.id)}
              defaultValues={{
                name: product.name,
                category: product.category,
                sellingPrice: product.sellingPrice,
                fluctuationPct: product.fluctuationPct,
                targetFoodCostPct: product.targetFoodCostPct,
              }}
              submitLabel="Simpan Perubahan"
              resetOnSuccess={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
