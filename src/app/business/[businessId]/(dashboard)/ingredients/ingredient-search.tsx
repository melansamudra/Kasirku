"use client";

import { useMemo, useState, type ReactNode } from "react";

const DEPARTMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "dapur", label: "🍳 Dapur" },
  { value: "bar", label: "🍹 Bar" },
  { value: "front", label: "🛎️ Front" },
];

export default function IngredientSearch({
  names,
  departments,
  children,
}: {
  names: string[];
  departments?: string[][];
  children: ReactNode[];
}) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState<string | null>(null);

  const visibleChildren = useMemo(() => {
    const q = query.trim().toLowerCase();
    return children.filter((_, idx) => {
      const matchesQuery = !q || (names[idx]?.toLowerCase().includes(q) ?? false);
      const matchesDepartment = !department || (departments?.[idx] ?? []).includes(department);
      return matchesQuery && matchesDepartment;
    });
  }, [children, names, departments, query, department]);

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

      {departments && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setDepartment(null)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              department === null
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
            }`}
          >
            Semua Divisi
          </button>
          {DEPARTMENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDepartment((d) => (d === opt.value ? null : opt.value))}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                department === opt.value
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

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
