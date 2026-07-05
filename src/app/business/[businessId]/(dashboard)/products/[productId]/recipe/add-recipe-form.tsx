"use client";

import { useActionState, useRef, useEffect } from "react";
import type { RecipeState } from "./actions";

const initialState: RecipeState = { error: null };

type Ingredient = { id: string; name: string; unit: string };

export default function AddRecipeForm({
  action,
  ingredients,
}: {
  action: (state: RecipeState, formData: FormData) => Promise<RecipeState>;
  ingredients: Ingredient[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  if (ingredients.length === 0) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
        Belum ada bahan baku untuk toko ini. Tambahkan dulu di halaman Bahan Baku.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div>
        <label htmlFor="ingredientId" className="mb-1 block text-xs font-medium text-zinc-600">
          Bahan Baku
        </label>
        <select
          id="ingredientId"
          name="ingredientId"
          required
          className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Pilih bahan…</option>
          {ingredients.map((ing) => (
            <option key={ing.id} value={ing.id}>
              {ing.name} ({ing.unit})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="qty" className="mb-1 block text-xs font-medium text-zinc-600">
          Jumlah per 1 produk
        </label>
        <input
          id="qty"
          name="qty"
          type="number"
          min="0"
          step="0.01"
          required
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          placeholder="mis. 15"
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
        {pending ? "Menyimpan…" : "Tambah ke Resep"}
      </button>
    </form>
  );
}
