"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CostBreakdownLine } from "@/lib/cost-control/compute-cost";
import DeleteItemButton from "./delete-item-button";
import OpnameSectionMultiSelect from "../ingredients/opname-section-multiselect";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatQty(value: number) {
  return Number(value.toFixed(2)).toLocaleString("id-ID");
}

// Pembatas visual "baru diupload/diedit vs lama" (keluhan user 2026-09-03:
// BSJ yang baru diupload HPP-nya kecampur begitu saja dengan upload lama di
// daftar, tidak ada penanda). Import (import-tool.tsx) UPDATE baris yang
// sudah ada (bukan bikin baris baru), jadi `updated_at` (trigger otomatis
// set_updated_at) adalah penanda paling akurat "kapan terakhir disentuh" --
// baik lewat import maupun edit manual di halaman detail.
const RECENT_THRESHOLD_MS = 24 * 3600 * 1000;

// `now` dikirim sebagai prop (dihitung sekali di server page.tsx) alih-alih
// panggil Date.now() langsung di sini -- komponen ini client-side, memanggil
// Date.now() saat render melanggar aturan purity React (hasil bisa beda
// tiap re-render tanpa ada perubahan input yang jelas).
function formatRelativeTime(iso: string, now: number): string {
  const diffMs = now - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export type SemiFinishedItemRow = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  minStock: number;
  category: string | null;
  updatedAt: string;
  unitCost: number;
  rawCost: number;
  fluctuationPct: number;
  breakdown: CostBreakdownLine[];
  sectionIds: string[];
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
  now,
  sections,
  updateSectionsAction,
}: {
  businessId: string;
  items: SemiFinishedItemRow[];
  now: number;
  sections: { id: string; name: string }[];
  updateSectionsAction: (itemId: string, sectionIds: string[]) => Promise<{ error: string | null }>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "recent">("name");

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter((c): c is string => !!c))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = items.filter((item) => {
      if (category && item.category !== category) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sortBy === "recent") {
      return result.slice().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
    return result;
  }, [items, query, category, sortBy]);

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

      <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500">
        <span>Urutkan:</span>
        <button
          type="button"
          onClick={() => setSortBy("name")}
          className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
            sortBy === "name" ? "bg-brand-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          }`}
        >
          Nama (A-Z)
        </button>
        <button
          type="button"
          onClick={() => setSortBy("recent")}
          className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
            sortBy === "recent" ? "bg-brand-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          }`}
        >
          Baru diupdate
        </button>
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
                      {now - new Date(item.updatedAt).getTime() < RECENT_THRESHOLD_MS && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                          🆕 Baru
                        </span>
                      )}
                      <OpnameSectionMultiSelect
                        entityId={item.id}
                        sectionIds={item.sectionIds}
                        sections={sections}
                        action={updateSectionsAction}
                      />
                    </div>
                    <p className="text-xs text-zinc-500">
                      Stok {formatQty(item.stock)} {item.unit}
                      {low && <span className="ml-1.5 font-medium text-amber-600">· rendah</span>}
                      <span className="ml-1.5 text-zinc-400">· diupdate {formatRelativeTime(item.updatedAt, now)}</span>
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
