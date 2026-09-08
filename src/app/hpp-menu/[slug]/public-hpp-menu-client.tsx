"use client";

import { useMemo, useState } from "react";

type Row = {
  id: string;
  name: string;
  category: string;
  department: string | null;
  price: number;
  cost: number;
  margin: number;
  pct: number;
  hppChecked: boolean;
  updatedAt: string;
};

const DEPARTMENT_LABELS: Record<string, string> = {
  dapur: "🍳 Dapur",
  bar: "🍹 Bar",
  front: "🧪 BSJ",
};

function fmt(v: number) {
  return `Rp${Math.round(v).toLocaleString("id-ID")}`;
}

function fmtDate(v: string) {
  return new Date(v).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default function PublicHppMenuClient({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");

  const departments = useMemo(() => {
    const set = new Set(rows.map((r) => r.department).filter((d): d is string => Boolean(d)));
    return [...set];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (department && r.department !== department) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q);
    });
  }, [rows, search, department]);

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2 print:hidden">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama menu atau kategori..."
          className="min-w-[200px] flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Semua Bagian</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {DEPARTMENT_LABELS[d] ?? d}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
        >
          🖨️ Cetak PDF
        </button>
      </div>

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
                  <th className="px-4 py-3 text-right">Diupdate</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium text-zinc-800">{r.name}</span>
                      <div className="text-[10px] text-zinc-400">
                        {r.category}
                        {r.department && ` · ${DEPARTMENT_LABELS[r.department] ?? r.department}`}
                      </div>
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
                    <td className="px-4 py-3 text-right text-[11px] text-zinc-400">
                      {r.hppChecked && <span className="mr-1 text-brand-600" title="HPP sudah dicek">✓</span>}
                      {fmtDate(r.updatedAt)}
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
