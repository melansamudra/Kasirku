"use client";

import { useActionState } from "react";
import type { SubmitOpnameState } from "./actions";

const initialState: SubmitOpnameState = { error: null, resetToken: 0 };

type Ingredient = { id: string; name: string; unit: string; stock: number };

export default function OpnameForm({
  action,
  ingredients,
  today,
}: {
  action: (state: SubmitOpnameState, formData: FormData) => Promise<SubmitOpnameState>;
  ingredients: Ingredient[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  if (ingredients.length === 0) {
    return <p className="text-xs text-zinc-400">Tidak ada bahan baku di divisi ini.</p>;
  }

  return (
    <form action={formAction} key={state.resetToken} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-zinc-600">
          Tanggal
          <input
            name="entryDate"
            type="date"
            required
            defaultValue={today}
            className="mt-1 block w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
          />
        </label>
        <label className="text-xs font-medium text-zinc-600">
          Nama Penghitung (opsional)
          <input
            name="submittedByName"
            type="text"
            placeholder="Nama staf"
            className="mt-1 block w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
          />
        </label>
      </div>

      <div className="space-y-1.5">
        {ingredients.map((ing) => (
          <div key={ing.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-zinc-800">{ing.name}</p>
              <p className="text-[11px] text-zinc-400">
                Sistem: {ing.stock} {ing.unit}
              </p>
            </div>
            <input
              name={`reported_${ing.id}`}
              type="number"
              min="0"
              step="0.01"
              placeholder="Stok fisik"
              className="w-28 shrink-0 rounded-lg border border-zinc-200 px-2 py-1.5 text-right text-xs focus:border-brand-600 focus:outline-none"
            />
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Menyimpan..." : "Catat Hasil Opname"}
      </button>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
