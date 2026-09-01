"use client";

import { useActionState } from "react";
import type { SemiFinishedProductState } from "./semi-finished-product-actions";

const initialState: SemiFinishedProductState = { error: null };

export default function AddSemiFinishedProductForm({
  action,
  options,
}: {
  action: (state: SemiFinishedProductState, formData: FormData) => Promise<SemiFinishedProductState>;
  options: { id: string; name: string; unit: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  if (options.length === 0) {
    return (
      <p className="text-xs text-zinc-400">
        Semua Bahan Setengah Jadi sudah punya produk terhubung, atau belum ada Bahan Setengah Jadi
        yang dibuat.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3" key={options.length}>
      <div>
        <label htmlFor="semiFinishedItemId" className="mb-1 block text-xs font-medium text-zinc-600">
          Bahan Setengah Jadi
        </label>
        <select
          id="semiFinishedItemId"
          name="semiFinishedItemId"
          required
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">— Pilih —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({o.unit})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="price" className="mb-1 block text-xs font-medium text-zinc-600">
          Harga Jual
        </label>
        <input
          id="price"
          name="price"
          type="number"
          min="1"
          step="1"
          required
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          placeholder="mis. 25000"
        />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "+ Tambah Produk"}
      </button>
    </form>
  );
}
