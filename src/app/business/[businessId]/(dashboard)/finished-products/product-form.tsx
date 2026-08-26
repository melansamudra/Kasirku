"use client";

import { useActionState, useRef, useEffect } from "react";
import type { ActionState } from "./actions";

const initialState: ActionState = { error: null };

export default function ProductForm({
  action,
  defaultValues,
  submitLabel,
  resetOnSuccess = true,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  defaultValues?: { name: string; category: string | null; sellingPrice: number | null };
  submitLabel: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error && resetOnSuccess) {
      formRef.current?.reset();
    }
  }, [pending, state.error, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div>
        <label htmlFor="name" className="mb-1 block text-xs font-medium text-zinc-600">
          Nama Produk Jadi
        </label>
        <input
          id="name"
          name="name"
          type="text"
          placeholder="mis. Rendang Siap Saji 500g"
          defaultValue={defaultValues?.name}
          required
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="category" className="mb-1 block text-xs font-medium text-zinc-600">
            Kategori (opsional)
          </label>
          <input
            id="category"
            name="category"
            type="text"
            defaultValue={defaultValues?.category ?? ""}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label htmlFor="sellingPrice" className="mb-1 block text-xs font-medium text-zinc-600">
            Harga Jual (opsional)
          </label>
          <input
            id="sellingPrice"
            name="sellingPrice"
            type="number"
            step="1"
            min="0"
            placeholder="untuk hitung margin"
            defaultValue={defaultValues?.sellingPrice ?? ""}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : submitLabel}
      </button>
    </form>
  );
}
