"use client";

import { useActionState, useRef, useEffect } from "react";
import type { AddSupplierState } from "./actions";

const initialState: AddSupplierState = { error: null };

export default function AddSupplierForm({
  action,
}: {
  action: (state: AddSupplierState, formData: FormData) => Promise<AddSupplierState>;
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
          Nama Supplier
        </label>
        <input
          id="name"
          name="name"
          type="text"
          placeholder="mis. CV Sumber Rejeki"
          required
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="phone" className="mb-1 block text-xs font-medium text-zinc-600">
            No. Telepon (opsional)
          </label>
          <input
            id="phone"
            name="phone"
            type="text"
            placeholder="08xxxxxxxxxx"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label htmlFor="address" className="mb-1 block text-xs font-medium text-zinc-600">
            Alamat (opsional)
          </label>
          <input
            id="address"
            name="address"
            type="text"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>
      <div>
        <label htmlFor="notes" className="mb-1 block text-xs font-medium text-zinc-600">
          Catatan (opsional)
        </label>
        <input
          id="notes"
          name="notes"
          type="text"
          placeholder="mis. termin bayar 14 hari"
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "+ Tambah Supplier"}
      </button>
    </form>
  );
}
