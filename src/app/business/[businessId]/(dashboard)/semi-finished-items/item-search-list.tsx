"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CostBreakdownLine } from "@/lib/cost-control/compute-cost";
import DeleteItemButton from "./delete-item-button";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatQty(value: number) {
  return Number(value.toFixed(2)).toLocaleString("id-ID");
}

export type SemiFinishedItemRow = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  minStock: number;
  category: string | null;
  unitCost: number;
  rawCost: number;
  fluctuationPct: number;
  breakdown: CostBreakdownLine[];
};

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
          {formatQty(line.qty)} {line.unit}
        </td>
        <td className="px-3 py-1.5 text-right">{formatRupiah(line.subtotal)}</td>
      </tr>
      {line.children?.map((child, i) => (
        <BreakdownRow key={i} line={child} depth={depth + 1} />
      ))}
    </>
  );
}

// Preview komponen resep dibuka inline dari baris list (bukan navigasi ke
// halaman detail) — datanya (breakdown) sudah dihitung sekali di server lewat
// computeAllSemiFinishedItemCosts, jadi expand di sini tidak perlu fetch lagi.
function ItemDetail({ item }: { item: SemiFinishedItemRow }) {
  if (item.breakdown.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-center text-xs text-zinc-400">
        Belum ada komponen resep — HPP masih Rp0.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200">
      <table className="w-full text-xs">
        <thead className="bg-zinc-50 text-zinc-500">
          <tr>
            <th className="px-3 py-1.5 text-left">Komponen</th>
            <th className="px-3 py-1.5 text-right">Jumlah</th>
            <th className="px-3 py-1.5 text-right">Biaya</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {item.breakdown.map((line, i) => (
            <BreakdownRow key={i} line={line} depth={0} />
          ))}
        </tbody>
        <tfoot className="bg-zinc-50">
          <tr>
            <td colSpan={2} className="px-3 py-1.5 text-right text-zinc-500">
              Sub total
            </td>
            <td className="px-3 py-1.5 text-right text-zinc-600">{formatRupiah(item.rawCost)}</td>
          </tr>
          {item.fluctuationPct > 0 && (
            <tr>
              <td colSpan={2} className="px-3 py-1.5 text-right text-zinc-500">
                Fluctuation ({item.fluctuationPct}%)
              </td>
              <td className="px-3 py-1.5 text-right text-zinc-600">
                {formatRupiah(item.unitCost - item.rawCost)}
              </td>
            </tr>
          )}
          <tr>
            <td colSpan={2} className="px-3 py-1.5 text-right font-semibold text-zinc-600">
              Total HPP per {item.unit}
            </td>
            <td className="px-3 py-1.5 text-right text-sm font-bold text-zinc-900">
              {formatRupiah(item.unitCost)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function SemiFinishedItemsList({
  businessId,
  items,
}: {
  businessId: string;
  items: SemiFinishedItemRow[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter((c): c is string => !!c))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (category && item.category !== category) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, category]);

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cek HPP — ketik nama bahan…"
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
          filtered.map((item) => {
            const low = item.stock < item.minStock;
            const open = openId === item.id;
            return (
              <div key={item.id} className="rounded-xl border border-zinc-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/business/${businessId}/semi-finished-items/${item.id}`}
                        className="text-sm font-medium text-zinc-900 hover:text-brand-600 hover:underline"
                      >
                        {item.name}
                      </Link>
                      {item.category && (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                          {item.category}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500">
                      Stok {formatQty(item.stock)} {item.unit}
                      {low && <span className="ml-1.5 font-medium text-amber-600">· rendah</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <p className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                      HPP {formatRupiah(item.unitCost)}/{item.unit}
                    </p>
                    <button
                      onClick={() => setOpenId(open ? null : item.id)}
                      className="rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:border-brand-300 hover:text-brand-600"
                      title={open ? "Sembunyikan komponen" : "Lihat komponen"}
                    >
                      {open ? "▾" : "▸"} Detail
                    </button>
                    <DeleteItemButton businessId={businessId} itemId={item.id} itemName={item.name} />
                  </div>
                </div>

                {open && (
                  <div className="border-t border-zinc-100 px-4 py-3">
                    <ItemDetail item={item} />
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            {query || category
              ? "Tidak ada bahan yang cocok dengan filter ini."
              : "Belum ada bahan setengah jadi. Tambahkan dulu, lalu atur resepnya di halaman detail."}
          </p>
        )}
      </div>
    </div>
  );
}
