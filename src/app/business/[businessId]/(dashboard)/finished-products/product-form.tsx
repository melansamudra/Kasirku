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
  defaultValues?: {
    name: string;
    category: string | null;
    sellingPrice: number | null;
    fluctuationPct?: number;
    targetFoodCostPct?: number | null;
  };
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
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="fluctuationPct" className="mb-1 block text-xs font-medium text-zinc-600">
            Fluctuation % (opsional)
          </label>
          <input
            id="fluctuationPct"
            name="fluctuationPct"
            type="number"
            step="0.01"
            min="0"
            max="99"
            placeholder="0"
            defaultValue={defaultValues?.fluctuationPct ?? 0}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label htmlFor="targetFoodCostPct" className="mb-1 block text-xs font-medium text-zinc-600">
            Target Food Cost % (opsional)
          </label>
          <input
            id="targetFoodCostPct"
            name="targetFoodCostPct"
            type="number"
            step="0.01"
            min="1"
            max="100"
            placeholder="mis. 31"
            defaultValue={defaultValues?.targetFoodCostPct ?? ""}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>
      <p className="-mt-1 text-[11px] text-zinc-400">
        Fluctuation ditambahkan di atas jumlah bahan sebelum jadi HPP final. Target Food Cost %
        dipakai untuk saran harga jual otomatis (HPP ÷ target %) — pendamping Harga Jual manual di atas.
      </p>

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
