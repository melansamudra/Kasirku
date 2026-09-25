"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import type { CostBreakdownLine } from "@/lib/cost-control/compute-cost";

export type CostControlHppRow = {
  id: string;
  type: "finished" | "semi";
  name: string;
  category: string;
  unit: string | null;
  price: number | null;
  cost: number;
  margin: number | null;
  pct: number | null;
  hppChecked: boolean | null;
  updatedAt: string;
  detailHref: string;
  breakdown: CostBreakdownLine[];
};

const TYPE_LABELS: Record<CostControlHppRow["type"], string> = {
  finished: "Produk Jadi",
  semi: "Bahan Setengah Jadi",
};

function fmt(v: number) {
  return `Rp${Math.round(v).toLocaleString("id-ID")}`;
}

function fmtQty(v: number) {
  return Number(v.toFixed(4)).toLocaleString("id-ID");
}

function fmtDate(v: string) {
  return new Date(v).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function BreakdownRow({ line, depth }: { line: CostBreakdownLine; depth: number }) {
  return (
    <>
      <tr>
        <td className="px-3 py-1.5" style={{ paddingLeft: `${12 + depth * 16}px` }}>
          {line.name}
          {line.componentType === "semi_finished" && (
            <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">
              setengah jadi
            </span>
          )}
        </td>
        <td className="px-3 py-1.5 text-right">
          {fmtQty(line.qty)} {line.unit}
        </td>
        <td className="px-3 py-1.5 text-right">{fmt(line.subtotal)}</td>
      </tr>
      {line.children?.map((child, i) => (
        <BreakdownRow key={i} line={child} depth={depth + 1} />
      ))}
    </>
  );
}

// Rekap HPP gabungan khusus bisnis cost-control -- beda dari HppMenuListClient
// biasa (yang berbasis products/product_recipes & bisa diedit resepnya inline)
// karena sumber datanya dua tabel berbeda (finished_products + semi_finished_items)
// yang masing-masing sudah punya halaman edit resep sendiri. Klik nama
// membuka breakdown bahan LANGSUNG di tempat (bukan pindah halaman) supaya
// gampang dicek cepat -- "buka halaman penuh" tetap ada buat yang mau edit.
export default function CostControlHppMenuList({ rows }: { rows: CostControlHppRow[] }) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"" | CostControlHppRow["type"]>("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (type && r.type !== type) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q);
    });
  }, [rows, search, type]);

  const withoutHpp = filtered.filter((r) => r.cost <= 0).length;

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
          value={type}
          onChange={(e) => setType(e.target.value as "" | CostControlHppRow["type"])}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Semua Tipe</option>
          <option value="finished">Produk Jadi</option>
          <option value="semi">Bahan Setengah Jadi</option>
        </select>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
        >
          🖨️ Cetak PDF
        </button>
      </div>

      {withoutHpp > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 print:hidden">
          {withoutHpp} item belum punya HPP (masih Rp0).
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
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3">Tipe</th>
                  <th className="px-4 py-3 text-right">Harga Jual</th>
                  <th className="px-4 py-3 text-right">HPP</th>
                  <th className="px-4 py-3 text-right">%HPP</th>
                  <th className="px-4 py-3 text-right">Margin</th>
                  <th className="px-4 py-3 text-right">Diperiksa/Diupdate</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const isOpen = expanded.has(r.id);
                  return (
                    <Fragment key={r.id}>
                      <tr className={`border-b border-zinc-50 last:border-0 ${i % 2 === 0 ? "" : "bg-zinc-50/40"}`}>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(r.id)}
                            className="flex items-center gap-1.5 text-left text-xs font-medium text-zinc-800 hover:text-brand-600 print:pointer-events-none"
                          >
                            <span className="text-[10px] text-zinc-400 print:hidden">{isOpen ? "▾" : "▸"}</span>
                            {r.name}
                          </button>
                          <div className="text-[10px] text-zinc-400">
                            {r.category}
                            {" · "}
                            <Link href={r.detailHref} className="text-zinc-400 hover:text-brand-600 hover:underline print:hidden">
                              buka halaman penuh ↗
                            </Link>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[11px] text-zinc-500">
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                            {TYPE_LABELS[r.type]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-zinc-600">{r.price != null ? fmt(r.price) : "-"}</td>
                        <td className={`px-4 py-3 text-right text-xs font-medium ${r.cost <= 0 ? "text-amber-600" : "text-zinc-800"}`}>
                          {fmt(r.cost)}
                          {r.unit && <span className="text-zinc-400">/{r.unit}</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold text-zinc-500">
                          {r.pct != null && r.pct > 0 ? `${r.pct.toFixed(1)}%` : "-"}
                        </td>
                        <td className={`px-4 py-3 text-right text-xs font-semibold ${r.margin == null ? "text-zinc-300" : r.margin >= 0 ? "text-brand-700" : "text-red-600"}`}>
                          {r.margin != null ? fmt(r.margin) : "-"}
                        </td>
                        <td className="px-4 py-3 text-right text-[11px] text-zinc-400">
                          {r.hppChecked && <span className="mr-1 text-brand-600" title="HPP sudah dicek">✓</span>}
                          {fmtDate(r.updatedAt)}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-zinc-50 last:border-0">
                          <td colSpan={7} className="bg-zinc-50/60 px-4 py-3">
                            {r.breakdown.length > 0 ? (
                              <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
                                <table className="w-full text-xs">
                                  <thead className="bg-zinc-50 text-zinc-500">
                                    <tr>
                                      <th className="px-3 py-1.5 text-left">Komponen</th>
                                      <th className="px-3 py-1.5 text-right">Jumlah</th>
                                      <th className="px-3 py-1.5 text-right">Biaya</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-zinc-100">
                                    {r.breakdown.map((line, idx) => (
                                      <BreakdownRow key={idx} line={line} depth={0} />
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="px-2 py-2 text-xs text-zinc-400">Belum ada komponen resep.</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
