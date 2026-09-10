"use client";

import { useMemo, useState } from "react";

function formatQty(value: number) {
  return Number(value.toFixed(2)).toLocaleString("id-ID");
}

export type RekonsilRow = {
  id: string;
  name: string;
  unit: string;
  saldoAkhir: number;
  masuk: number;
  keluar: number;
};

export default function RekonsilList({ items }: { items: RekonsilRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <div>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari bahan…"
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
        {filtered.length > 0 ? (
          filtered.map((item) => (
            <div key={item.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              <p className="text-sm font-medium text-zinc-900">{item.name}</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[10px] text-zinc-400">Saldo Akhir Hari Itu</p>
                  <p className="text-sm font-semibold text-zinc-800">
                    {formatQty(item.saldoAkhir)} {item.unit}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-400">Masuk</p>
                  <p className="text-sm font-semibold text-emerald-600">
                    {item.masuk > 0 ? `+${formatQty(item.masuk)} ${item.unit}` : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-400">Keluar</p>
                  <p className="text-sm font-semibold text-red-600">
                    {item.keluar > 0 ? `-${formatQty(item.keluar)} ${item.unit}` : "-"}
                  </p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            {query ? "Tidak ada bahan yang cocok dengan pencarian ini." : "Belum ada data bahan baku."}
          </p>
        )}
      </div>
    </div>
  );
}
