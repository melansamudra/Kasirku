"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "./actions";

const initialState: ActionState = { error: null };

export default function RecipeYieldForm({
  action,
  unit,
  currentYieldQty,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  unit: string;
  currentYieldQty: number | null;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [yieldQty, setYieldQty] = useState(String(currentYieldQty ?? 1));

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="w-40">
        <label htmlFor="yieldQty" className="mb-1 block text-[11px] font-medium text-zinc-600">
          Resep ini menghasilkan
        </label>
        <div className="flex items-center gap-1.5">
          <input
            id="yieldQty"
            name="yieldQty"
            type="number"
            step="0.0001"
            min="0.0001"
            required
            value={yieldQty}
            onChange={(e) => setYieldQty(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <span className="shrink-0 text-xs text-zinc-500">{unit}</span>
        </div>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Simpan"}
      </button>
      {state.error && <p className="w-full text-[11px] text-red-600">{state.error}</p>}
    </form>
  );
}
