"use client";

import { useActionState, useRef, useEffect } from "react";
import type { AddProductState } from "./actions";

const initialState: AddProductState = { error: null };

export default function AddProductForm({
  action,
}: {
  action: (state: AddProductState, formData: FormData) => Promise<AddProductState>;
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
          Nama Produk
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          placeholder="mis. Es Kopi Susu"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="category" className="mb-1 block text-xs font-medium text-zinc-600">
            Kategori
          </label>
          <input
            id="category"
            name="category"
            type="text"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="mis. Minuman"
          />
        </div>
        <div>
          <label htmlFor="emoji" className="mb-1 block text-xs font-medium text-zinc-600">
            Ikon (emoji)
          </label>
          <input
            id="emoji"
            name="emoji"
            type="text"
            maxLength={4}
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-center text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="☕"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="price" className="mb-1 block text-xs font-medium text-zinc-600">
            Harga Jual
          </label>
          <input
            id="price"
            name="price"
            type="number"
            min="0"
            step="1"
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="28000"
          />
        </div>
        <div>
          <label htmlFor="cost" className="mb-1 block text-xs font-medium text-zinc-600">
            Modal (HPP)
          </label>
          <input
            id="cost"
            name="cost"
            type="number"
            min="0"
            step="1"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="11000"
          />
        </div>
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
            placeholder="50"
          />
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
        {pending ? "Menyimpan…" : "Tambah Produk"}
      </button>
    </form>
  );
}
