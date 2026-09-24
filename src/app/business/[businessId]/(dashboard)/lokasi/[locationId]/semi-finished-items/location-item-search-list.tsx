"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CostBreakdownLine } from "@/lib/cost-control/compute-cost";
import AdjustStockForm from "@/components/adjust-stock-form";
import OpnameSectionMultiSelect from "../../../ingredients/opname-section-multiselect";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export type LocationSemiFinishedItemRow = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  unitCost: number;
  rawCost: number;
  fluctuationPct: number;
  breakdown: CostBreakdownLine[];
  sectionIds: string[];
  adjustAction: (newStock: number, reason: string) => Promise<{ error: string | null }>;
};

export default function LocationSemiFinishedItemsList({
  businessId,
  locationName,
  items,
  sections,
  updateSectionsAction,
}: {
  businessId: string;
  locationName: string;
  items: LocationSemiFinishedItemRow[];
  sections: { id: string; name: string }[];
  updateSectionsAction: (itemId: string, sectionIds: string[]) => Promise<{ error: string | null }>;
}) {
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
          placeholder="Cari bahan setengah jadi…"
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
          filtered.map((i) => (
            <details key={i.id} className="group rounded-xl border border-zinc-200 bg-white">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 select-none">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-zinc-300 transition-transform group-open:rotate-90">▶</span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-zinc-900">{i.name}</p>
                      <OpnameSectionMultiSelect
                        entityId={i.id}
                        sectionIds={i.sectionIds}
                        sections={sections}
                        action={updateSectionsAction}
                      />
                    </div>
                    <p className="text-xs text-zinc-500">
                      Stok di {locationName}: {i.stock} {i.unit}
                      {i.breakdown.length > 0 ? ` · ${i.breakdown.length} bahan` : " · belum ada resep"}
                    </p>
                    <p className="text-xs font-medium text-brand-600">
                      HPP {formatRupiah(i.unitCost)}/{i.unit}
                    </p>
                  </div>
                </div>
              </summary>

              <div className="border-t border-zinc-100 px-4 pb-3 pt-2">
                {i.breakdown.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-zinc-400">
                        <tr>
                          <th className="py-1 text-left font-medium">Bahan</th>
                          <th className="py-1 text-right font-medium">Jumlah</th>
                          <th className="py-1 text-right font-medium">Harga Satuan</th>
                          <th className="py-1 text-right font-medium">Biaya</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-50">
                        {i.breakdown.map((line, idx) => (
                          <tr key={idx}>
                            <td className="py-1.5 text-zinc-700">
                              {line.name}
                              {line.componentType === "semi_finished" && (
                                <span className="ml-1 text-[10px] text-zinc-400">(BSJ)</span>
                              )}
                            </td>
                            <td className="py-1.5 text-right text-zinc-500">
                              {Number(line.qty.toFixed(4)).toLocaleString("id-ID")} {line.unit}
                            </td>
                            <td className="py-1.5 text-right text-zinc-500">{formatRupiah(line.unitCost)}</td>
                            <td className="py-1.5 text-right font-medium text-zinc-800">
                              {formatRupiah(line.subtotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {i.fluctuationPct > 0 && (
                        <tfoot>
                          <tr>
                            <td colSpan={3} className="pt-1.5 text-right text-zinc-400">
                              Loss Faktor ({i.fluctuationPct}%)
                            </td>
                            <td className="pt-1.5 text-right font-medium text-zinc-600">
                              {formatRupiah(i.unitCost - i.rawCost)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                ) : (
                  <p className="py-2 text-xs text-zinc-400">Belum ada resep untuk bahan ini.</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Link
                    href={`/business/${businessId}/semi-finished-items/${i.id}`}
                    className="text-xs font-medium text-brand-600 hover:underline"
                  >
                    Edit Resep / HPP →
                  </Link>
                  <AdjustStockForm
                    itemName={i.name}
                    currentStock={i.stock}
                    unit={i.unit}
                    action={i.adjustAction}
                  />
                </div>
              </div>
            </details>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            {query ? "Tidak ada bahan yang cocok dengan pencarian ini." : "Belum ada bahan setengah jadi di lokasi ini."}
          </p>
        )}
      </div>
    </div>
  );
}
