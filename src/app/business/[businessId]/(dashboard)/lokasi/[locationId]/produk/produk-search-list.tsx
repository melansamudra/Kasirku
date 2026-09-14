"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Ingredient = { name: string; qty: number; unit: string; unitCost: number; lineCost: number };
type Product = {
  id: string;
  name: string;
  category: string | null;
  price: number;
  cost: number;
  variant_label: string | null;
};

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export default function ProdukSearchList({
  businessId,
  products,
  recipesByProduct,
}: {
  businessId: string;
  products: Product[];
  recipesByProduct: Record<string, Ingredient[]>;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.category ?? "").toLowerCase().includes(q),
    );
  }, [products, search]);

  return (
    <>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Cari nama produk atau kategori..."
        className="mt-4 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />

      {filtered.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
          Tidak ada produk yang cocok dengan pencarian.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {filtered.map((p) => {
            const price = Number(p.price);
            const cost = Number(p.cost);
            const margin = price - cost;
            const marginPct = price > 0 ? (margin / price) * 100 : 0;
            const ingredients = recipesByProduct[p.id] ?? [];
            return (
              <details key={p.id} className="group rounded-xl border border-zinc-200 bg-white">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 select-none">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="shrink-0 text-zinc-300 transition-transform group-open:rotate-90">▶</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900">
                        {p.name}
                        {p.variant_label ? ` (${p.variant_label})` : ""}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {p.category || "Tanpa kategori"}
                        {ingredients.length > 0 ? ` · ${ingredients.length} bahan` : " · belum ada resep"}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-zinc-900">{formatRupiah(price)}</p>
                    <p className="text-[11px] text-zinc-400">HPP {formatRupiah(cost)}</p>
                    <p className={`text-[11px] font-medium ${margin >= 0 ? "text-brand-600" : "text-red-600"}`}>
                      Margin {formatRupiah(margin)} ({marginPct.toFixed(1)}%)
                    </p>
                  </div>
                </summary>

                <div className="border-t border-zinc-100 px-4 pb-3 pt-2">
                  {ingredients.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="text-zinc-400">
                          <tr>
                            <th className="py-1 text-left font-medium">Bahan</th>
                            <th className="py-1 text-right font-medium">Jumlah</th>
                            <th className="py-1 text-right font-medium">Harga Satuan</th>
                            <th className="py-1 text-right font-medium">Biaya</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-50">
                          {ingredients.map((ing, idx) => (
                            <tr key={idx}>
                              <td className="py-1.5 text-zinc-700">{ing.name}</td>
                              <td className="py-1.5 text-right text-zinc-500">
                                {Number(ing.qty.toFixed(4)).toLocaleString("id-ID")} {ing.unit}
                              </td>
                              <td className="py-1.5 text-right text-zinc-500">{formatRupiah(ing.unitCost)}</td>
                              <td className="py-1.5 text-right font-medium text-zinc-800">{formatRupiah(ing.lineCost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="py-2 text-xs text-zinc-400">Belum ada resep untuk produk ini.</p>
                  )}
                  <Link
                    href={`/business/${businessId}/products/${p.id}/recipe`}
                    className="mt-2 inline-block text-xs font-medium text-brand-600 hover:underline"
                  >
                    Edit Resep / HPP →
                  </Link>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}
