"use client";

import { useActionState, useRef, useEffect } from "react";
import type { ActionState } from "./actions";

const initialState: ActionState = { error: null };

export default function DistributeForm({
  action,
  bufferItems,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  bufferItems: { id: string; name: string; unit: string; stock: number }[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  if (bufferItems.length === 0) {
    return <p className="text-xs text-zinc-300">Buffer kosong — belum ada bahan yang dibeli.</p>;
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <select
          name="ingredientId"
          required
          className="rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">— Pilih bahan —</option>
          {bufferItems.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} (buffer: {i.stock} {i.unit})
            </option>
          ))}
        </select>
        <input
          name="qty"
          type="number"
          min="0"
          step="any"
          placeholder="Qty disalurkan"
          required
          className="rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyalurkan…" : "Salurkan ke gudang tujuan"}
      </button>
    </form>
  );
}
