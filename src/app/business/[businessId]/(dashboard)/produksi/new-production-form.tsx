"use client";

import { useActionState, useRef, useEffect } from "react";
import type { ActionState } from "./actions";

const initialState: ActionState = { error: null };

export default function NewProductionForm({
  action,
  items,
  employees,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  items: { id: string; name: string; unit: string; stock: number }[];
  employees: { id: string; name: string }[];
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
        <label htmlFor="semiFinishedItemId" className="mb-1 block text-xs font-medium text-zinc-600">
          Bahan Setengah Jadi
        </label>
        <select
          id="semiFinishedItemId"
          name="semiFinishedItemId"
          required
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Pilih item…</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} (stok {item.stock} {item.unit})
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="qtyProduced" className="mb-1 block text-xs font-medium text-zinc-600">
            Jumlah Diproduksi
          </label>
          <input
            id="qtyProduced"
            name="qtyProduced"
            type="number"
            step="0.01"
            min="0.01"
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label htmlFor="employeeId" className="mb-1 block text-xs font-medium text-zinc-600">
            Tim Produksi (opsional)
          </label>
          <select
            id="employeeId"
            name="employeeId"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">—</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="note" className="mb-1 block text-xs font-medium text-zinc-600">
          Catatan (opsional)
        </label>
        <input
          id="note"
          name="note"
          type="text"
          placeholder="mis. batch pagi"
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Catat Produksi & Tambah Stok"}
      </button>
    </form>
  );
}
