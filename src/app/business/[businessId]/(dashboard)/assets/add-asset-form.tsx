"use client";

import { useActionState, useRef, useEffect } from "react";
import type { AddAssetState } from "./actions";

const initialState: AddAssetState = { error: null };

export default function AddAssetForm({
  action,
  today,
}: {
  action: (state: AddAssetState, formData: FormData) => Promise<AddAssetState>;
  today: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div>
        <label htmlFor="name" className="mb-1 block text-xs font-medium text-zinc-600">
          Nama Aset
        </label>
        <input
          id="name"
          name="name"
          type="text"
          placeholder="mis. Kulkas 2 Pintu"
          required
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="purchaseDate" className="mb-1 block text-xs font-medium text-zinc-600">
            Tanggal Beli
          </label>
          <input
            id="purchaseDate"
            name="purchaseDate"
            type="date"
            defaultValue={today}
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label htmlFor="cost" className="mb-1 block text-xs font-medium text-zinc-600">
            Harga Beli (Rp)
          </label>
          <input
            id="cost"
            name="cost"
            type="number"
            min="0"
            step="1"
            placeholder="5000000"
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="usefulLifeMonths" className="mb-1 block text-xs font-medium text-zinc-600">
            Umur Ekonomis (bulan)
          </label>
          <input
            id="usefulLifeMonths"
            name="usefulLifeMonths"
            type="number"
            min="1"
            step="1"
            placeholder="36"
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label htmlFor="salvageValue" className="mb-1 block text-xs font-medium text-zinc-600">
            Nilai Residu (Rp, opsional)
          </label>
          <input
            id="salvageValue"
            name="salvageValue"
            type="number"
            min="0"
            step="1"
            placeholder="0"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
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
        {pending ? "Menyimpan…" : "+ Tambah Aset Tetap"}
      </button>
    </form>
  );
}
