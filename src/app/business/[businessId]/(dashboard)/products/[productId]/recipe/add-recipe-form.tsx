"use client";

import { useState, useTransition } from "react";
import type { BatchRecipeItemInput, BatchRecipeState } from "./actions";

type Ingredient = { id: string; name: string; unit: string };
type DraftRow = {
  key: string;
  mode: "existing" | "new";
  ingredientId: string;
  newName: string;
  newUnit: string;
  newUnitCost: string;
  qty: string;
};

const NEW_INGREDIENT_VALUE = "__new__";

function emptyRow(): DraftRow {
  return { key: crypto.randomUUID(), mode: "existing", ingredientId: "", newName: "", newUnit: "", newUnitCost: "", qty: "" };
}

export default function AddRecipeForm({
  action,
  ingredients,
  onSaved,
}: {
  action: (items: BatchRecipeItemInput[]) => Promise<BatchRecipeState>;
  ingredients: Ingredient[];
  onSaved?: () => void;
}) {
  const [rows, setRows] = useState<DraftRow[]>([emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function updateRow(key: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.key !== key)));
  }

  function handleSave() {
    setError(null);
    setSavedMsg(null);

    const filled = rows.filter((r) => r.ingredientId || r.newName || r.qty);
    if (filled.length === 0) {
      setError("Isi minimal satu baris bahan.");
      return;
    }
    const items: BatchRecipeItemInput[] = [];
    for (const r of filled) {
      const qty = Number(r.qty);
      if (!r.qty || Number.isNaN(qty) || qty <= 0) {
        setError("Ada baris dengan jumlah yang belum diisi/tidak valid.");
        return;
      }
      if (r.mode === "new") {
        if (!r.newName.trim() || !r.newUnit.trim()) {
          setError("Ada bahan baru yang nama/satuannya belum diisi.");
          return;
        }
        const unitCost = r.newUnitCost ? Number(r.newUnitCost) : 0;
        if (Number.isNaN(unitCost) || unitCost < 0) {
          setError(`Harga bahan baru "${r.newName}" harus angka dan tidak boleh negatif.`);
          return;
        }
        items.push({ kind: "new", name: r.newName.trim(), unit: r.newUnit.trim(), unitCost, qty });
      } else {
        if (!r.ingredientId) {
          setError("Ada baris yang belum pilih bahan.");
          return;
        }
        items.push({ kind: "existing", ingredientId: r.ingredientId, qty });
      }
    }

    startTransition(async () => {
      const result = await action(items);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavedMsg(`${result.savedCount} bahan berhasil ditambahkan ke resep.`);
      setRows([emptyRow()]);
      onSaved?.();
    });
  }

  return (
    <div className="space-y-3">
      {ingredients.length === 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Belum ada bahan baku untuk toko ini — pilih &quot;+ Bahan baru...&quot; di bawah untuk langsung buat sambil susun resep.
        </p>
      )}

      {rows.map((row) => (
        <div key={row.key} className="rounded-xl border border-zinc-100 bg-zinc-50 p-2.5">
          {row.mode === "existing" ? (
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <select
                  value={row.ingredientId}
                  onChange={(e) => {
                    if (e.target.value === NEW_INGREDIENT_VALUE) {
                      updateRow(row.key, { mode: "new", ingredientId: "" });
                    } else {
                      updateRow(row.key, { ingredientId: e.target.value });
                    }
                  }}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                >
                  <option value="">Pilih bahan…</option>
                  <option value={NEW_INGREDIENT_VALUE}>➕ Bahan baru...</option>
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name} ({ing.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-28">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.qty}
                  onChange={(e) => updateRow(row.key, { qty: e.target.value })}
                  placeholder="Jumlah"
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <button
                type="button"
                onClick={() => removeRow(row.key)}
                disabled={rows.length === 1}
                title="Hapus baris"
                className="shrink-0 rounded-lg px-2.5 py-2 text-sm text-zinc-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-brand-600">➕ Bahan baru</p>
                <button
                  type="button"
                  onClick={() => updateRow(row.key, { mode: "existing", newName: "", newUnit: "", newUnitCost: "" })}
                  className="text-[11px] text-zinc-400 hover:text-zinc-600"
                >
                  Batal, pilih dari daftar
                </button>
              </div>
              <div className="flex items-start gap-2">
                <input
                  type="text"
                  value={row.newName}
                  onChange={(e) => updateRow(row.key, { newName: e.target.value })}
                  placeholder="Nama bahan baru"
                  className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
                <input
                  type="text"
                  value={row.newUnit}
                  onChange={(e) => updateRow(row.key, { newUnit: e.target.value })}
                  placeholder="Satuan (gr/ml/pcs)"
                  className="w-32 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <div className="flex items-start gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.newUnitCost}
                  onChange={(e) => updateRow(row.key, { newUnitCost: e.target.value })}
                  placeholder="Harga per satuan (boleh kosong = 0)"
                  className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
                <div className="w-28">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.qty}
                    onChange={(e) => updateRow(row.key, { qty: e.target.value })}
                    placeholder="Jumlah"
                    className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  disabled={rows.length === 1}
                  title="Hapus baris"
                  className="shrink-0 rounded-lg px-2.5 py-2 text-sm text-zinc-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="w-full rounded-xl border border-dashed border-zinc-300 py-2 text-xs font-medium text-zinc-500 hover:border-brand-400 hover:text-brand-600"
      >
        + Tambah Baris Bahan
      </button>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
      {savedMsg && !error && <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">{savedMsg}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Simpan Semua ke Resep"}
      </button>
    </div>
  );
}
