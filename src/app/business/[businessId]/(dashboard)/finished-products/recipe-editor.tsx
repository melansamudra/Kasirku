"use client";

import { useActionState, useRef, useEffect } from "react";
import type { ActionState } from "./actions";

const initialState: ActionState = { error: null };

export default function RecipeEditor({
  action,
  ingredients,
  semiFinishedOptions,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  ingredients: { id: string; name: string; unit: string }[];
  semiFinishedOptions: { id: string; name: string; unit: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  const noOptions = ingredients.length === 0 && semiFinishedOptions.length === 0;

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="min-w-[220px] flex-1">
        <label htmlFor="component" className="mb-1 block text-xs font-medium text-zinc-600">
          Komponen
        </label>
        <select
          id="component"
          name="component"
          required
          disabled={noOptions}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-zinc-50"
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
      <div className="w-28">
        <label htmlFor="qty" className="mb-1 block text-xs font-medium text-zinc-600">
          Jumlah
        </label>
        <input
          id="qty"
          name="qty"
          type="number"
          step="0.0001"
          min="0.0001"
          required
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <button
        type="submit"
        disabled={pending || noOptions}
        className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "+ Tambah"}
      </button>
      {state.error && (
        <p className="w-full rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}
      {noOptions && (
        <p className="w-full text-xs text-zinc-400">
          Belum ada bahan baku/bahan setengah jadi yang bisa dipakai sebagai komponen.
        </p>
      )}
    </form>
  );
}
