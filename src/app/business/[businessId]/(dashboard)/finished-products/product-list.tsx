"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import DeleteProductButton from "./delete-product-button";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export type FinishedProductRow = {
  id: string;
  name: string;
  category: string | null;
  hpp: number;
  effectivePrice: number | null;
  isSuggestedPrice: boolean;
  marginPct: number | null;
};

export default function FinishedProductsList({
  businessId,
  products,
}: {
  businessId: string;
  products: FinishedProductRow[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter((c): c is string => !!c))].sort(),
    [products],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category && p.category !== category) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, query, category]);

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari produk jadi…"
            className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700 focus:border-brand-400 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-600"
              title="Bersihkan pencarian"
            >
              ✕
            </button>
          )}
        </div>
        {categories.length > 0 && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-700 focus:border-brand-400 focus:outline-none sm:w-48"
          >
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {filtered.length > 0 ? (
          filtered.map((product) => (
            <div
              key={product.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link
                    href={`/business/${businessId}/finished-products/${product.id}`}
                    className="text-sm font-medium text-zinc-900 hover:text-brand-600 hover:underline"
                  >
                    {product.name}
                  </Link>
                  {product.category && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                      {product.category}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500">
                  HPP {formatRupiah(product.hpp)}
                  {product.effectivePrice != null
                    ? ` · Jual ${formatRupiah(product.effectivePrice)}${product.isSuggestedPrice ? " (saran)" : ""}`
                    : ""}
                </p>
              </div>
              {product.effectivePrice == null ? (
                <p className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                  Belum ada harga jual
                </p>
              ) : (
                product.marginPct != null && (
                  <p
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      product.marginPct >= 30
                        ? "bg-emerald-50 text-emerald-700"
                        : product.marginPct >= 15
                          ? "bg-amber-50 text-amber-700"
                          : "bg-red-50 text-red-700"
                    }`}
                  >
                    Margin {product.marginPct}%
                  </p>
                )
              )}
              <DeleteProductButton businessId={businessId} productId={product.id} productName={product.name} />
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            {query || category
              ? "Tidak ada produk yang cocok dengan filter ini."
              : "Belum ada produk jadi. Tambahkan dulu, lalu atur resepnya di halaman detail."}
          </p>
        )}
      </div>
    </div>
  );
}
