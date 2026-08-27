"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import type { ActionState } from "./actions";
import RecipeRowsBuilder from "./recipe-rows-builder";

const initialState: ActionState = { error: null };

export default function ItemForm({
  action,
  defaultValues,
  submitLabel,
  resetOnSuccess = true,
  recipeBuilder,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  defaultValues?: { name: string; unit: string; minStock: number; fluctuationPct?: number; barcode?: string | null };
  submitLabel: string;
  resetOnSuccess?: boolean;
  recipeBuilder?: {
    ingredients: { id: string; name: string; unit: string }[];
    semiFinishedOptions: { id: string; name: string; unit: string }[];
  };
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  // Dipakai sebagai `key` RecipeRowsBuilder supaya remount bersih (state
  // internalnya React-controlled, tidak ikut ke-reset oleh formRef.reset()
  // yang cuma menyentuh DOM uncontrolled).
  const [recipeBuilderResetToken, setRecipeBuilderResetToken] = useState(0);
  // Controlled cuma supaya RecipeRowsBuilder bisa tampilkan label "Resep
  // ini menghasilkan X <satuan>" yang ikut satuan yang lagi diketik.
  const [unit, setUnit] = useState(defaultValues?.unit ?? "");

  useEffect(() => {
    if (!pending && !state.error && resetOnSuccess) {
      formRef.current?.reset();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecipeBuilderResetToken((n) => n + 1);
      setUnit("");
    }
  }, [pending, state.error, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div>
        <label htmlFor="name" className="mb-1 block text-xs font-medium text-zinc-600">
          Nama Bahan Setengah Jadi
        </label>
        <input
          id="name"
          name="name"
          type="text"
          placeholder="mis. Bumbu Dasar Kuning"
          defaultValue={defaultValues?.name}
          required
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="unit" className="mb-1 block text-xs font-medium text-zinc-600">
            Satuan
          </label>
          <input
            id="unit"
            name="unit"
            type="text"
            placeholder="kg / liter / pcs"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
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
            step="0.01"
            min="0"
            defaultValue={defaultValues?.minStock ?? 0}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>
      <div>
        <label htmlFor="fluctuationPct" className="mb-1 block text-xs font-medium text-zinc-600">
          Fluctuation % (buffer susut/fluktuasi harga)
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
        <p className="mt-1 text-[11px] text-zinc-400">
          Ditambahkan di atas jumlah bahan mentah sebelum jadi HPP final — mis. isi 15 untuk buffer 15%.
        </p>
      </div>
      <div>
        <label htmlFor="barcode" className="mb-1 block text-xs font-medium text-zinc-600">
          Barcode (opsional)
        </label>
        <input
          id="barcode"
          name="barcode"
          type="text"
          placeholder="Scan atau ketik kode barcode"
          defaultValue={defaultValues?.barcode ?? ""}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <p className="mt-1 text-[11px] text-zinc-400">
          Supaya bisa dicari lewat scan di link publik Permintaan Resto.
        </p>
      </div>

      {recipeBuilder && (
        <div className="border-t border-zinc-100 pt-3">
          <RecipeRowsBuilder
            key={recipeBuilderResetToken}
            ingredients={recipeBuilder.ingredients}
            semiFinishedOptions={recipeBuilder.semiFinishedOptions}
            resultUnit={unit}
          />
        </div>
      )}

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
