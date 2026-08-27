"use client";

import { useState } from "react";

type ComponentOption = { id: string; name: string; unit: string };
type Row = { key: string; component: string; qty: string; qtyUnit: "base" | "convenience" };

// Sama pola konversi kemudahan input dengan RecipeEditor (resep tetap
// disimpan di satuan dasar gr/ml, ini murni multiplier di client sebelum
// disubmit).
const CONVENIENCE_UNITS: Record<string, { label: string; factor: number }> = {
  gr: { label: "kg", factor: 1000 },
  ml: { label: "liter", factor: 1000 },
};

function emptyRow(): Row {
  return { key: crypto.randomUUID(), component: "", qty: "", qtyUnit: "base" };
}

export default function RecipeRowsBuilder({
  ingredients,
  semiFinishedOptions,
  resultUnit,
}: {
  ingredients: ComponentOption[];
  semiFinishedOptions: ComponentOption[];
  resultUnit?: string;
}) {
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  // Staf isi bahan APA ADANYA sejumlah 1 batch produksi (mis. "pakai 2kg
  // ayam buat 20 porsi"), bukan dihitung manual per-1-satuan -- lebih
  // natural & sama seperti resep beneran. qty tiap baris dibagi `yieldQty`
  // sebelum disimpan, karena semi_finished_recipes.qty tetap berarti PER 1
  // satuan hasil (skema/backend tidak berubah).
  const [yieldQty, setYieldQty] = useState("1");

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }
  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function findUnit(component: string): string | null {
    if (!component) return null;
    const [type, id] = component.split(":");
    const list = type === "ingredient" ? ingredients : semiFinishedOptions;
    return list.find((x) => x.id === id)?.unit ?? null;
  }

  const yieldNum = Number(yieldQty) > 0 ? Number(yieldQty) : 1;

  const serialized = rows
    .filter((r) => r.component && r.qty)
    .map((r) => {
      const baseUnit = findUnit(r.component);
      const convenience = baseUnit ? CONVENIENCE_UNITS[baseUnit.toLowerCase()] : undefined;
      const qtyNum = Number(r.qty);
      const totalQty = convenience && r.qtyUnit === "convenience" ? qtyNum * convenience.factor : qtyNum;
      return { component: r.component, qty: totalQty / yieldNum };
    });

  const noOptions = ingredients.length === 0 && semiFinishedOptions.length === 0;

  return (
    <div>
      <input type="hidden" name="recipeRows" value={JSON.stringify(serialized)} />
      <label className="mb-1 block text-xs font-medium text-zinc-600">
        Komponen Resep (opsional — bisa ditambah/diubah lagi nanti)
      </label>
      <p className="mb-2 text-[11px] text-zinc-400">
        Isi total bahan untuk 1 kali produksi (mis. resep menghasilkan 20 {resultUnit || "satuan"}, pakai
        2kg ayam) — HPP per {resultUnit || "satuan"} dihitung otomatis dari situ.
      </p>
      <div className="mb-3 w-40">
        <label htmlFor="recipe-yield" className="mb-1 block text-[11px] font-medium text-zinc-600">
          Resep ini menghasilkan
        </label>
        <div className="flex items-center gap-1.5">
          <input
            id="recipe-yield"
            type="number"
            step="0.0001"
            min="0.0001"
            value={yieldQty}
            onChange={(e) => setYieldQty(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <span className="shrink-0 text-xs text-zinc-500">{resultUnit || "satuan"}</span>
        </div>
      </div>
      {noOptions ? (
        <p className="text-xs text-zinc-400">
          Belum ada bahan baku/bahan setengah jadi lain yang bisa dipakai sebagai komponen.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const baseUnit = findUnit(row.component);
            const convenience = baseUnit ? CONVENIENCE_UNITS[baseUnit.toLowerCase()] : undefined;
            return (
              <div key={row.key} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1">
                  <select
                    value={row.component}
                    onChange={(e) => updateRow(row.key, { component: e.target.value, qtyUnit: "base" })}
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  >
                    <option value="">Pilih komponen…</option>
                    {ingredients.length > 0 && (
                      <optgroup label="Bahan Baku">
                        {ingredients.map((i) => (
                          <option key={i.id} value={`ingredient:${i.id}`}>
                            {i.name} ({i.unit})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {semiFinishedOptions.length > 0 && (
                      <optgroup label="Bahan Setengah Jadi">
                        {semiFinishedOptions.map((s) => (
                          <option key={s.id} value={`semi_finished:${s.id}`}>
                            {s.name} ({s.unit})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
                <div className="w-24">
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    placeholder="Jumlah dipakai"
                    value={row.qty}
                    onChange={(e) => updateRow(row.key, { qty: e.target.value })}
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                </div>
                {convenience && (
                  <div className="w-24">
                    <select
                      value={row.qtyUnit}
                      onChange={(e) => updateRow(row.key, { qtyUnit: e.target.value as Row["qtyUnit"] })}
                      className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    >
                      <option value="base">{baseUnit}</option>
                      <option value="convenience">{convenience.label}</option>
                    </select>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  className="rounded-xl border border-zinc-200 px-3 py-2.5 text-xs text-zinc-400 hover:text-red-500"
                >
                  Hapus
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={addRow}
            className="w-full rounded-xl border border-dashed border-zinc-300 py-2 text-xs font-medium text-zinc-500 hover:border-brand-300 hover:text-brand-700"
          >
            + Tambah komponen lain
          </button>
        </div>
      )}
    </div>
  );
}
