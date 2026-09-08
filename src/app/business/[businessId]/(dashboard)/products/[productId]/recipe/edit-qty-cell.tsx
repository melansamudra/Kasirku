"use client";

import { useState, useTransition } from "react";
import { updateRecipeItemQty } from "./actions";

function formatQty(value: number) {
  return Number(value.toFixed(4)).toLocaleString("id-ID");
}

export default function EditQtyCell({
  businessId,
  productId,
  recipeItemId,
  qty,
  unit,
}: {
  businessId: string;
  productId: string;
  recipeItemId: string;
  qty: number;
  unit: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(qty));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(String(qty));
          setError(null);
          setEditing(true);
        }}
        title="Klik untuk ubah jumlah"
        className="rounded px-1 py-0.5 text-right text-zinc-600 hover:bg-zinc-100 hover:text-brand-600"
      >
        {formatQty(qty)} {unit}
      </button>
    );
  }

  function save() {
    const next = Number(value);
    if (!value || Number.isNaN(next) || next <= 0) {
      setError("Angka > 0");
      return;
    }
    startTransition(async () => {
      const result = await updateRecipeItemQty(businessId, productId, recipeItemId, next);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <input
        type="number"
        min="0"
        step="0.01"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        disabled={pending}
        className="w-20 rounded-lg border border-zinc-200 px-2 py-1 text-right text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
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
    </div>
  );
}
