import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { addRecipeItem } from "./actions";
import AddRecipeForm from "./add-recipe-form";
import RemoveRecipeButton from "./remove-recipe-button";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatQty(value: number) {
  return Number(value.toFixed(4)).toLocaleString("id-ID");
}

export default async function ProductRecipePage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string }>;
}) {
  const { businessId, productId } = await params;
  const supabase = await createClient();

  const { data: product } = await supabase
    .from("products")
    .select("id, name, category, price, cost")
    .eq("id", productId)
    .eq("business_id", businessId)
    .single();

  if (!product) {
    notFound();
  }

  const { data: recipeItems } = await supabase
    .from("product_recipes")
    .select("id, qty, unit, ingredients(id, name, unit_cost)")
    .eq("product_id", productId)
    .order("id", { ascending: true });

  const ingredients = await fetchAllRows((from, to) =>
    supabase
      .from("ingredients")
      .select("id, name, unit")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .range(from, to),
  );

  const boundAddRecipeItem = addRecipeItem.bind(null, businessId, productId);

  const price = Number(product.price);
  const cost = Number(product.cost);
  const margin = price - cost;
  const marginPct = price > 0 ? (margin / price) * 100 : 0;

  const rows = (recipeItems ?? []).map((r) => {
    const ingredient = r.ingredients as unknown as { id: string; name: string; unit_cost: number } | null;
    const unitCost = Number(ingredient?.unit_cost ?? 0);
    const lineCost = unitCost * Number(r.qty);
    return { id: r.id, qty: Number(r.qty), unit: r.unit, name: ingredient?.name ?? "(bahan dihapus)", unitCost, lineCost };
  });
  const totalHpp = rows.reduce((s, r) => s + r.lineCost, 0);

  return (
    <div className="w-full max-w-2xl">
      <Link href={`/business/${businessId}/products`} className="text-xs text-zinc-400 hover:text-brand-600">
        ← Kembali ke Kelola Produk
      </Link>
      <h1 className="mt-2 text-lg font-bold text-zinc-900">{product.name}</h1>
      {product.category && <p className="mt-0.5 text-xs text-zinc-400">{product.category}</p>}

      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-zinc-100 bg-white px-4 py-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Harga Jual</p>
          <p className="mt-1 text-base font-bold text-zinc-900">{formatRupiah(price)}</p>
        </div>
        <div className="rounded-xl border border-zinc-100 bg-white px-4 py-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">HPP</p>
          <p className="mt-1 text-base font-bold text-zinc-900">{formatRupiah(cost)}</p>
        </div>
        <div className="rounded-xl border border-zinc-100 bg-white px-4 py-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Margin</p>
          <p className={`mt-1 text-base font-bold ${margin >= 0 ? "text-brand-700" : "text-red-600"}`}>
            {formatRupiah(margin)}
          </p>
          <p className="text-[11px] text-zinc-400">{marginPct.toFixed(1)}%</p>
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Resep (per 1 produk)</h2>

        {rows.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">Bahan</th>
                  <th className="px-3 py-2 text-right">Jumlah</th>
                  <th className="px-3 py-2 text-right">Harga Satuan</th>
                  <th className="px-3 py-2 text-right">Biaya</th>
                  <th className="w-8 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((r) => {
                  const pct = totalHpp > 0 ? (r.lineCost / totalHpp) * 100 : 0;
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2 text-zinc-800">
                        {r.name}
                        <div className="mt-1 h-1 w-full max-w-[120px] overflow-hidden rounded-full bg-zinc-100">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-600">
                        {formatQty(r.qty)} {r.unit}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-500">{formatRupiah(r.unitCost)}</td>
                      <td className="px-3 py-2 text-right font-medium text-zinc-800">{formatRupiah(r.lineCost)}</td>
                      <td className="px-2 py-2 text-right">
                        <RemoveRecipeButton businessId={businessId} productId={productId} recipeItemId={r.id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-zinc-50">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-zinc-600">
                    Total HPP
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-bold text-zinc-900">{formatRupiah(totalHpp)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada resep. HPP produk ini masih diisi manual ({formatRupiah(cost)}).
          </p>
        )}

        <div className="mt-4 border-t border-zinc-100 pt-4">
          <h3 className="mb-3 text-xs font-semibold text-zinc-700">Tambah Bahan ke Resep</h3>
          <AddRecipeForm action={boundAddRecipeItem} ingredients={ingredients ?? []} />
        </div>
      </div>
    </div>
  );
}
