"use client";

import { useState, useActionState } from "react";
import type { SemiFinishedProductState } from "./semi-finished-product-actions";

const initialState: SemiFinishedProductState = { error: null };

export default function EditSemiFinishedProductPriceForm({
  price,
  action,
}: {
  price: number;
  action: (state: SemiFinishedProductState, formData: FormData) => Promise<SemiFinishedProductState>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, initialState);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 text-xs font-medium text-zinc-400 hover:text-brand-600 hover:underline"
      >
        Edit Harga
      </button>
    );
  }

  return (
    <form action={formAction} className="flex shrink-0 items-center gap-1.5">
      <input
        name="price"
        type="number"
        min="1"
        step="1"
        required
        defaultValue={price}
        className="w-24 rounded-lg border border-zinc-200 px-2 py-1 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-2 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "…" : "Simpan"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
      >
        Batal
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
