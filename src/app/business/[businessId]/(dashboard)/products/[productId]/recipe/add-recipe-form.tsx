"use client";

import { useState, useTransition } from "react";
import type { BatchRecipeState } from "./actions";

type Ingredient = { id: string; name: string; unit: string };
type DraftRow = { key: string; ingredientId: string; qty: string };

function emptyRow(): DraftRow {
  return { key: crypto.randomUUID(), ingredientId: "", qty: "" };
}

export default function AddRecipeForm({
  action,
  ingredients,
}: {
  action: (items: { ingredientId: string; qty: number }[]) => Promise<BatchRecipeState>;
  ingredients: Ingredient[];
}) {
  const [rows, setRows] = useState<DraftRow[]>([emptyRow()]);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (ingredients.length === 0) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
        Belum ada bahan baku untuk toko ini. Tambahkan dulu di halaman Bahan Baku.
      </p>
    );
  }

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

    const filled = rows.filter((r) => r.ingredientId || r.qty);
    if (filled.length === 0) {
      setError("Isi minimal satu baris bahan.");
      return;
    }
    const items: { ingredientId: string; qty: number }[] = [];
    for (const r of filled) {
      const qty = Number(r.qty);
      if (!r.ingredientId) {
        setError("Ada baris yang belum pilih bahan.");
        return;
      }
      if (!r.qty || Number.isNaN(qty) || qty <= 0) {
        setError("Ada baris dengan jumlah yang belum diisi/tidak valid.");
        return;
      }
      items.push({ ingredientId: r.ingredientId, qty });
    }

    startTransition(async () => {
      const result = await action(items);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavedMsg(`${result.savedCount} bahan berhasil ditambahkan ke resep.`);
      setRows([emptyRow()]);
    });
  }

  return (
    <div className="space-y-3">
      {rows.map((row, idx) => (
        <div key={row.key} className="flex items-start gap-2">
          <div className="flex-1">
            <select
              value={row.ingredientId}
              onChange={(e) => updateRow(row.key, { ingredientId: e.target.value })}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">Pilih bahan…</option>
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
          {idx === rows.length - 1 && (
            <span className="sr-only">baris terakhir</span>
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
