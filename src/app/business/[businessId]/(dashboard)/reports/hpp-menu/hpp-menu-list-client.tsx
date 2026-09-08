"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Row = {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  margin: number;
  pct: number;
};

function fmt(v: number) {
  return `Rp${Math.round(v).toLocaleString("id-ID")}`;
}

export default function HppMenuListClient({ businessId, rows }: { businessId: string; rows: Row[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
  }, [rows, search]);

  const withoutHpp = filtered.filter((r) => r.cost <= 0).length;

  return (
    <>
      <div className="mt-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama menu atau kategori..."
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {withoutHpp > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {withoutHpp} menu belum punya HPP (masih Rp0).
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-400">
          Tidak ada menu yang cocok.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-3">Nama Menu</th>
                  <th className="px-4 py-3 text-right">Harga Jual</th>
                  <th className="px-4 py-3 text-right">HPP</th>
                  <th className="px-4 py-3 text-right">%HPP</th>
                  <th className="px-4 py-3 text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/business/${businessId}/products/${r.id}/recipe`}
                        className="text-xs font-medium text-zinc-800 hover:text-brand-600 hover:underline"
                      >
                        {r.name}
                      </Link>
                      <div className="text-[10px] text-zinc-400">{r.category}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-zinc-600">{fmt(r.price)}</td>
                    <td className={`px-4 py-3 text-right text-xs font-medium ${r.cost <= 0 ? "text-amber-600" : "text-zinc-800"}`}>
                      {fmt(r.cost)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-zinc-500">
                      {r.pct > 0 ? `${r.pct.toFixed(1)}%` : "-"}
                    </td>
                    <td className={`px-4 py-3 text-right text-xs font-semibold ${r.margin >= 0 ? "text-brand-700" : "text-red-600"}`}>
                      {fmt(r.margin)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
