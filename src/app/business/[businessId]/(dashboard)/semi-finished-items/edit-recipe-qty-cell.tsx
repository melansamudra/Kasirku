"use client";

import { useState, useTransition } from "react";
import { updateRecipeComponentQty } from "./actions";

function formatQty(value: number) {
  return Number(value.toFixed(4)).toLocaleString("id-ID");
}

// Qty TERSIMPAN selalu per-1-satuan-hasil (lihat compute-cost.ts) -- tapi
// kalau item ini punya batch_yield_qty, staf mikirnya dalam skala batch
// (mis. "600 gr buat 1 panci/55 porsi"). Tampilan & edit di sini SELALU
// pakai skala batch kalau batch_yield_qty diisi -- tidak ada toggle mode
// lain lagi (sempat ada dropdown batch/per-1-satuan, ternyata bikin
// bingung), baru dibagi batch_yield_qty sebelum dikirim ke server.
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
  const displayQty = hasBatchMode ? qty * batchYieldQty! : qty;

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(displayQty));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(String(displayQty));
          setError(null);
          setEditing(true);
        }}
        title="Klik untuk ubah jumlah"
        className="rounded px-1 py-0.5 text-zinc-600 hover:bg-zinc-100 hover:text-brand-600"
      >
        {formatQty(displayQty)} {unit}
      </button>
    );
  }

  function save() {
    const entered = Number(value);
    if (!value || Number.isNaN(entered) || entered <= 0) {
      setError("Angka > 0");
      return;
    }
    const next = hasBatchMode ? entered / batchYieldQty! : entered;
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
    <span className="inline-flex items-center gap-1">
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
