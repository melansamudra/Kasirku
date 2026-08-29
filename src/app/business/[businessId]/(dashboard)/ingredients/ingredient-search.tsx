"use client";

import { useMemo, useState, type ReactNode } from "react";

export default function IngredientSearch({ names, children }: { names: string[]; children: ReactNode[] }) {
  const [query, setQuery] = useState("");

  const visibleChildren = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return children;
    return children.filter((_, idx) => names[idx]?.toLowerCase().includes(q));
  }, [children, names, query]);

  return (
    <div>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari bahan baku…"
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

      <div className="mt-3 space-y-2">
        {visibleChildren.length > 0 ? (
          visibleChildren
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Tidak ada bahan baku yang cocok dengan pencarian ini.
          </p>
        )}
      </div>
    </div>
  );
}
