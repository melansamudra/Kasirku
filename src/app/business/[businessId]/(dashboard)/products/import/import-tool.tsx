"use client";

import { useActionState, useMemo, useState } from "react";
import type { ImportActionState } from "./actions";

export type ImportGroupRow = { ingredientId: string; qtyPerBatch: number; unit: string };
export type ImportGroup = { itemName: string; batchYield: number; rows: ImportGroupRow[] };

const initialState: ImportActionState = { error: null, success: false };
const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

export default function ImportTool({
  groups,
  ingredientPrices,
  itemStatus,
  action,
}: {
  groups: ImportGroup[];
  ingredientPrices: Record<string, { name: string; unitCost: number }>;
  itemStatus: Record<string, "missing" | "empty" | "filled">;
  action: (state: ImportActionState, formData: FormData) => Promise<ImportActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  const { pendingGroups, doneGroups, missingGroups } = useMemo(() => {
    const pendingGroups: ImportGroup[] = [];
    const doneGroups: ImportGroup[] = [];
    const missingGroups: ImportGroup[] = [];
    for (const g of groups) {
      const status = itemStatus[g.itemName];
      if (status === "missing") missingGroups.push(g);
      else if (status === "filled") doneGroups.push(g);
      else pendingGroups.push(g);
    }
    return { pendingGroups, doneGroups, missingGroups };
  }, [groups, itemStatus]);

  const [itemName, setItemName] = useState(groups[0]?.itemName ?? "");
  const [porsi, setPorsi] = useState(String(groups[0]?.batchYield ?? ""));

  const group = groups.find((g) => g.itemName === itemName);
  const isMissingProduct = itemStatus[itemName] === "missing";

  function handleSelectItem(name: string) {
    setItemName(name);
    const g = groups.find((x) => x.itemName === name);
    setPorsi(String(g?.batchYield ?? ""));
  }

  const porsiNum = Number(porsi) > 0 ? Number(porsi) : 0;

  const computedRows = (group?.rows ?? []).map((r) => {
    const price = ingredientPrices[r.ingredientId];
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
  const hppPerPorsi = porsiNum > 0 ? totalHPP / porsiNum : 0;

  return (
    <div>
      {missingGroups.length > 0 && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {missingGroups.length} menu di file Excel belum ada di Kelola Produk — buat dulu produknya (nama harus
          sama persis) baru bisa disimpan resepnya: {missingGroups.map((g) => g.itemName).join(", ")}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="itemName" className="mb-1 block text-xs font-medium text-zinc-600">
            Nama Produk
          </label>
          <select
            id="itemName"
            value={itemName}
            onChange={(e) => handleSelectItem(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {pendingGroups.length > 0 && (
              <optgroup label={`Resep Belum Diisi (${pendingGroups.length})`}>
                {pendingGroups.map((g) => (
                  <option key={g.itemName} value={g.itemName}>
                    {g.itemName}
                  </option>
                ))}
              </optgroup>
            )}
            {doneGroups.length > 0 && (
              <optgroup label={`Resep Sudah Ada — Akan Ditimpa (${doneGroups.length})`}>
                {doneGroups.map((g) => (
                  <option key={g.itemName} value={g.itemName}>
                    {g.itemName} (sudah ada resepnya)
                  </option>
                ))}
              </optgroup>
            )}
            {missingGroups.length > 0 && (
              <optgroup label={`Belum Ada di Kelola Produk (${missingGroups.length})`}>
                {missingGroups.map((g) => (
                  <option key={g.itemName} value={g.itemName}>
                    {g.itemName} (belum ada produknya)
                  </option>
                ))}
              </optgroup>
            )}
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

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-100">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-zinc-500">
              <th className="px-3 py-2 font-medium">Bahan</th>
              <th className="px-3 py-2 font-medium">Qty</th>
              <th className="px-3 py-2 font-medium">Satuan</th>
              <th className="px-3 py-2 font-medium">Harga Satuan</th>
              <th className="px-3 py-2 font-medium">Harga Baris</th>
            </tr>
          </thead>
          <tbody>
            {computedRows.map((r) => (
              <tr key={r.ingredientId} className="border-b border-zinc-50 last:border-0">
                <td className="px-3 py-2 text-zinc-800">
                  {r.displayName}
                  {r.priceMissing && <span className="ml-1 text-red-500">(harga tidak ditemukan)</span>}
                  {r.qtyPerBatch <= 0 && <span className="ml-1 text-amber-500">(qty 0 — dilewati saat simpan)</span>}
                </td>
                <td className="px-3 py-2 text-zinc-600">{r.qtyPerBatch.toLocaleString("id-ID")}</td>
                <td className="px-3 py-2 text-zinc-600">{r.unit}</td>
                <td className="px-3 py-2 text-zinc-600">{rupiah(r.hargaSatuan)}</td>
                <td className="px-3 py-2 text-zinc-600">{rupiah(r.hargaBaris)}</td>
              </tr>
            ))}
            {computedRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-zinc-400">
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
        <div className="flex justify-between border-t border-zinc-200 pt-1">
          <span className="font-semibold text-zinc-700">HPP Per Porsi</span>
          <span className="font-bold text-brand-700">{rupiah(hppPerPorsi)}</span>
        </div>
      </div>

      <form action={formAction} className="mt-4">
        <input type="hidden" name="itemName" value={itemName} />
        <input type="hidden" name="porsi" value={porsi} />

        {state.error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>}
        {state.success && !pending && (
          <p className="mb-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
            Resep &quot;{itemName}&quot; tersimpan — {computedRows.length} bahan.
          </p>
        )}

        <button
          type="submit"
          disabled={pending || computedRows.length === 0 || isMissingProduct}
          className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : isMissingProduct ? "Buat produknya dulu di Kelola Produk" : "Simpan Resep Ini"}
        </button>
      </form>
    </div>
  );
}
