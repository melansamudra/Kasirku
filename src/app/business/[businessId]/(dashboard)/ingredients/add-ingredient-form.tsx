"use client";

import { useActionState, useRef, useEffect } from "react";
import type { AddIngredientState } from "./actions";

const initialState: AddIngredientState = { error: null };

export default function AddIngredientForm({
  action,
}: {
  action: (state: AddIngredientState, formData: FormData) => Promise<AddIngredientState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name" className="mb-1 block text-xs font-medium text-zinc-600">
          Nama Bahan
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          placeholder="mis. Kopi Bubuk"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="unit" className="mb-1 block text-xs font-medium text-zinc-600">
            Satuan
          </label>
          <input
            id="unit"
            name="unit"
            type="text"
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="gr"
          />
        </div>
        <div>
          <label htmlFor="unitCost" className="mb-1 block text-xs font-medium text-zinc-600">
            Harga/Satuan
          </label>
          <input
            id="unitCost"
            name="unitCost"
            type="number"
            min="0"
            step="1"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="150"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="stock" className="mb-1 block text-xs font-medium text-zinc-600">
            Stok
          </label>
          <input
            id="stock"
            name="stock"
            type="number"
            min="0"
            step="1"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="2000"
          />
        </div>
        <div>
          <label htmlFor="minStock" className="mb-1 block text-xs font-medium text-zinc-600">
            Stok Minimum
          </label>
          <input
            id="minStock"
            name="minStock"
            type="number"
            min="0"
            step="1"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="0 = tanpa notifikasi"
          />
        </div>
      </div>

      <div className="rounded-xl bg-zinc-50 p-3">
        <p className="mb-2 text-[11px] font-medium text-zinc-500">
          Satuan Beli (opsional) — kalau belinya beda satuan dari stok, mis. beli per Sak/Karung
          tapi stok dihitung per gram.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="purchaseUnit" className="mb-1 block text-xs font-medium text-zinc-600">
              Satuan Beli
            </label>
            <input
              id="purchaseUnit"
              name="purchaseUnit"
              type="text"
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              placeholder="Sak"
            />
          </div>
          <div>
            <label htmlFor="purchaseConversion" className="mb-1 block text-xs font-medium text-zinc-600">
              Isi per Satuan Beli
            </label>
            <input
              id="purchaseConversion"
              name="purchaseConversion"
              type="number"
              min="0"
              step="any"
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              placeholder="25000"
            />
          </div>
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Tambah Bahan"}
      </button>
    </form>
  );
}
