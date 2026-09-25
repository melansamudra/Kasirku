"use client";

import { useState, useTransition } from "react";
import { updateRecipeComponentQty } from "./actions";

function formatQty(value: number) {
  return Number(value.toFixed(4)).toLocaleString("id-ID");
}

// Qty TERSIMPAN selalu per-1-satuan-hasil (lihat compute-cost.ts) -- tapi
// kalau item ini punya batch_yield_qty, staf mikirnya dalam skala batch
// (mis. "600 gr buat 1 panci/55 porsi", bukan "10,9 gr per porsi"), sama
// seperti waktu nambah baris baru (RecipeDropdownMultiAdd). Jadi kotak edit
// ini default tampil & terima angka SKALA BATCH, baru dibagi batch_yield_qty
// sebelum dikirim ke server -- storage & rumus HPP (compute-cost.ts) sama
// sekali tidak berubah, cuma UI editnya yang mengikuti cara mikir batch.
export default function EditRecipeQtyCell({
  businessId,
  semiFinishedItemId,
  recipeRowId,
  qty,
  unit,
  batchYieldQty,
  onSaved,
}: {
  businessId: string;
  semiFinishedItemId: string;
  recipeRowId: string;
  qty: number;
  unit: string;
  batchYieldQty?: number | null;
  onSaved?: () => void;
}) {
  const hasBatchMode = !!batchYieldQty && batchYieldQty > 0 && batchYieldQty !== 1;
  const [editing, setEditing] = useState(false);
  const [scaleMode, setScaleMode] = useState<"batch" | "unit">(hasBatchMode ? "batch" : "unit");
  const [value, setValue] = useState(String(qty));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startEditing() {
    const mode = hasBatchMode ? "batch" : "unit";
    setScaleMode(mode);
    setValue(String(mode === "batch" ? qty * batchYieldQty! : qty));
    setError(null);
    setEditing(true);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEditing}
        title="Klik untuk ubah jumlah"
        className="rounded px-1 py-0.5 text-zinc-600 hover:bg-zinc-100 hover:text-brand-600"
      >
        {hasBatchMode ? (
          <>
            {formatQty(qty * batchYieldQty!)} {unit}{" "}
            <span className="text-zinc-400">
              (≈ {formatQty(qty)} {unit} / 1 hasil)
            </span>
          </>
        ) : (
          <>
            {formatQty(qty)} {unit}
          </>
        )}
      </button>
    );
  }

  function save() {
    const entered = Number(value);
    if (!value || Number.isNaN(entered) || entered <= 0) {
      setError("Angka > 0");
      return;
    }
    const next = scaleMode === "batch" ? entered / batchYieldQty! : entered;
    startTransition(async () => {
      const result = await updateRecipeComponentQty(businessId, semiFinishedItemId, recipeRowId, next);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      onSaved?.();
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {hasBatchMode && (
        <select
          value={scaleMode}
          onChange={(e) => {
            const mode = e.target.value as "batch" | "unit";
            // Konversi dari nilai yang lagi diketik (bukan dari qty semula),
            // supaya perubahan yang belum disimpan tidak hilang saat ganti mode.
            setValue((prevVal) => {
              const current = Number(prevVal);
              if (Number.isNaN(current)) return prevVal;
              return String(mode === "batch" ? current * batchYieldQty! : current / batchYieldQty!);
            });
            setScaleMode(mode);
          }}
          disabled={pending}
          className="rounded-lg border border-zinc-200 px-1.5 py-1 text-[11px] focus:border-brand-600 focus:outline-none"
        >
          <option value="batch">per batch ({batchYieldQty})</option>
          <option value="unit">per 1 {unit}</option>
        </select>
      )}
      <input
        type="number"
        min="0"
        step="0.0001"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        disabled={pending}
        className="w-20 rounded-lg border border-zinc-200 px-2 py-1 text-right text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      <span className="text-xs text-zinc-500">{unit}</span>
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="rounded-lg bg-brand-600 px-2 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        ✓
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={pending}
        className="rounded-lg px-1.5 py-1 text-xs text-zinc-400 hover:text-zinc-600"
      >
        ✕
      </button>
      {error && <span className="text-[10px] text-red-500">{error}</span>}
    </span>
  );
}
