"use client";

import { useMemo, useState } from "react";

export type PersediaanRow = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  unitCost: number;
  total: number;
};

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatQty(value: number) {
  return Number(value.toFixed(4)).toLocaleString("id-ID");
}

export default function PersediaanTable({
  title,
  rows,
  subtotal,
}: {
  title: string;
  rows: PersediaanRow[];
  subtotal: number;
}) {
  const [query, setQuery] = useState("");
  const [hideZero, setHideZero] = useState(false);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (hideZero && r.stock === 0) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, hideZero]);

  return (
    <div className="mt-4 rounded-xl bg-white shadow-sm p-4 print:rounded-none print:shadow-none print:p-0 print:mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:block">
        <h2 className="text-sm font-bold text-zinc-900">{title}</h2>
        <p className="text-sm font-bold text-zinc-900">{formatRupiah(subtotal)}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Cari di ${title.toLowerCase()}…`}
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs focus:border-brand-400 focus:outline-none"
        />
        <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-zinc-500">
          <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
          Sembunyikan stok kosong
        </label>
      </div>

      <div className="mt-3 overflow-x-auto print:overflow-visible">
        <table className="w-full text-xs print:text-[10px]">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              <th className="py-2 pr-2">Nama</th>
              <th className="py-2 pr-2 text-right">Stok</th>
              <th className="py-2 pr-2">Satuan</th>
              <th className="py-2 pr-2 text-right">Harga/Unit</th>
              <th className="py-2 pl-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length > 0 ? (
              visibleRows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 last:border-0">
                  <td className="py-2 pr-2 font-medium text-zinc-800">{r.name}</td>
                  <td className="py-2 pr-2 text-right text-zinc-600">{formatQty(r.stock)}</td>
                  <td className="py-2 pr-2 text-zinc-500">{r.unit}</td>
                  <td className="py-2 pr-2 text-right text-zinc-600">{formatRupiah(r.unitCost)}</td>
                  <td className="py-2 pl-2 text-right font-semibold text-zinc-800">{formatRupiah(r.total)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="py-6 text-center text-zinc-400">
                  Tidak ada item yang cocok.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-200">
              <td colSpan={4} className="py-2 pr-2 text-right text-[11px] font-semibold text-zinc-500">
                Subtotal {title}
              </td>
              <td className="py-2 pl-2 text-right text-sm font-bold text-zinc-900">{formatRupiah(subtotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
