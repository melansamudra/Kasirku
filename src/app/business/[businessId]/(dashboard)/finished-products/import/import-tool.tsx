"use client";

import { useActionState, useMemo, useState } from "react";
import type { ImportActionState } from "./actions";

export type ImportGroupRow = {
  componentType: "ingredient" | "semi_finished";
  componentId: string;
  qtyPerBatch: number;
  unit: string;
};
export type ImportGroup = { itemName: string; batchYield: number; rows: ImportGroupRow[] };

const initialState: ImportActionState = { error: null, success: false };
const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

export default function ImportTool({
  groups,
  componentPrices,
  existingNames,
  action,
}: {
  groups: ImportGroup[];
  componentPrices: Record<string, { name: string; unitCost: number; type: "ingredient" | "semi_finished" }>;
  existingNames: string[];
  action: (state: ImportActionState, formData: FormData) => Promise<ImportActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const existingSet = useMemo(() => new Set(existingNames), [existingNames]);

  const [itemName, setItemName] = useState(groups[0]?.itemName ?? "");
  const [porsi, setPorsi] = useState(String(groups[0]?.batchYield ?? ""));
  const [lossFactorPct, setLossFactorPct] = useState("0");

  const group = groups.find((g) => g.itemName === itemName);

  function handleSelectItem(name: string) {
    setItemName(name);
    const g = groups.find((x) => x.itemName === name);
    setPorsi(String(g?.batchYield ?? ""));
  }

  const porsiNum = Number(porsi) > 0 ? Number(porsi) : 0;
  const lossFactorNum = Number(lossFactorPct) >= 0 ? Number(lossFactorPct) : 0;

  const computedRows = (group?.rows ?? []).map((r) => {
    const price = componentPrices[r.componentId];
    const hargaSatuan = price?.unitCost ?? 0;
    const hargaBaris = r.qtyPerBatch * hargaSatuan;
    return {
      ...r,
      displayName: price?.name ?? "(bahan tidak ditemukan)",
      hargaSatuan,
      hargaBaris,
      priceMissing: !price,
    };
  });
  const totalHPP = computedRows.reduce((sum, r) => sum + r.hargaBaris, 0);
  const lossAmount = totalHPP * (lossFactorNum / 100);
  const totalHPPAkhir = totalHPP + lossAmount;
  const hppPerPorsi = porsiNum > 0 ? totalHPPAkhir / porsiNum : 0;

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="itemName" className="mb-1 block text-xs font-medium text-zinc-600">
            Nama Produk Jadi
          </label>
          <select
            id="itemName"
            value={itemName}
            onChange={(e) => handleSelectItem(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {groups.map((g) => (
              <option key={g.itemName} value={g.itemName}>
                {g.itemName} {existingSet.has(g.itemName) ? "(sudah ada — akan ditimpa)" : "(baru)"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="porsi" className="mb-1 block text-xs font-medium text-zinc-600">
            Jumlah Porsi
          </label>
          <input
            id="porsi"
            type="number"
            step="0.01"
            min="0.01"
            value={porsi}
            onChange={(e) => setPorsi(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      <div className="mt-3 w-40">
        <label htmlFor="lossFactorPct" className="mb-1 block text-xs font-medium text-zinc-600">
          Loss Faktor %
        </label>
        <input
          id="lossFactorPct"
          type="number"
          step="0.01"
          min="0"
          max="99"
          value={lossFactorPct}
          onChange={(e) => setLossFactorPct(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-100">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-zinc-500">
              <th className="px-3 py-2 font-medium">Bahan</th>
              <th className="px-3 py-2 font-medium">Qty</th>
              <th className="px-3 py-2 font-medium">Satuan</th>
              <th className="px-3 py-2 font-medium">Harga Satuan</th>
              <th className="px-3 py-2 font-medium">Harga Baris</th>
              <th className="px-3 py-2 font-medium">%HPP</th>
            </tr>
          </thead>
          <tbody>
            {computedRows.map((r) => (
              <tr key={r.componentId} className="border-b border-zinc-50 last:border-0">
                <td className="px-3 py-2 text-zinc-800">
                  {r.displayName}
                  <span
                    className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      r.componentType === "semi_finished" ? "bg-amber-50 text-amber-700" : "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    {r.componentType === "semi_finished" ? "BSJ" : "Bahan Baku"}
                  </span>
                  {r.priceMissing && <span className="ml-1 text-red-500">(harga tidak ditemukan)</span>}
                  {r.qtyPerBatch <= 0 && <span className="ml-1 text-amber-500">(qty 0 — dilewati saat simpan)</span>}
                </td>
                <td className="px-3 py-2 text-zinc-600">{r.qtyPerBatch.toLocaleString("id-ID")}</td>
                <td className="px-3 py-2 text-zinc-600">{r.unit}</td>
                <td className="px-3 py-2 text-zinc-600">{rupiah(r.hargaSatuan)}</td>
                <td className="px-3 py-2 text-zinc-600">{rupiah(r.hargaBaris)}</td>
                <td className="px-3 py-2 text-zinc-600">
                  {totalHPP > 0 ? ((r.hargaBaris / totalHPP) * 100).toFixed(1) : "0.0"}%
                </td>
              </tr>
            ))}
            {computedRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-zinc-400">
                  Tidak ada data bahan untuk menu ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 space-y-1 rounded-xl bg-zinc-50 p-3 text-xs">
        <div className="flex justify-between">
          <span className="text-zinc-500">Total HPP</span>
          <span className="font-medium text-zinc-800">{rupiah(totalHPP)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Loss Faktor ({lossFactorNum}%)</span>
          <span className="font-medium text-zinc-800">{rupiah(lossAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Total HPP Akhir</span>
          <span className="font-medium text-zinc-800">{rupiah(totalHPPAkhir)}</span>
        </div>
        <div className="flex justify-between border-t border-zinc-200 pt-1">
          <span className="font-semibold text-zinc-700">HPP Per Porsi</span>
          <span className="font-bold text-brand-700">{rupiah(hppPerPorsi)}</span>
        </div>
      </div>

      <form action={formAction} className="mt-4">
        <input type="hidden" name="itemName" value={itemName} />
        <input type="hidden" name="porsi" value={porsi} />
        <input type="hidden" name="lossFactorPct" value={lossFactorPct} />

        {state.error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>}
        {state.success && !pending && (
          <p className="mb-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
            Resep &quot;{itemName}&quot; tersimpan — {computedRows.length} bahan.
          </p>
        )}

        <button
          type="submit"
          disabled={pending || computedRows.length === 0}
          className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : "Simpan Resep Ini"}
        </button>
      </form>
    </div>
  );
}
