"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import type { PurchaseUnitState } from "./actions";

type PurchaseUnit = { id: string; unitName: string; conversion: number };

const initialState: PurchaseUnitState = { error: null };

export default function PurchaseUnitsManager({
  baseUnit,
  units,
  addAction,
  deleteAction,
}: {
  baseUnit: string;
  units: PurchaseUnit[];
  addAction: (state: PurchaseUnitState, formData: FormData) => Promise<PurchaseUnitState>;
  deleteAction: (unitId: string) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(addAction, initialState);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleDelete(unitId: string) {
    setDeletingId(unitId);
    deleteAction(unitId).then(() => {
      setDeletingId(null);
      router.refresh();
    });
  }

  return (
    <div className="mt-1">
      {units.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {units.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10.5px] text-zinc-600"
            >
              1 {u.unitName} = {u.conversion} {baseUnit}
              <button
                onClick={() => handleDelete(u.id)}
                disabled={deletingId === u.id}
                className="text-zinc-400 hover:text-red-600 disabled:opacity-50"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {open ? (
        <form
          action={formAction}
          className="mt-1.5 flex flex-wrap items-center gap-1.5"
          onSubmit={() => setTimeout(() => router.refresh(), 300)}
        >
          <input
            name="unitName"
            type="text"
            placeholder="Sak Besar"
            required
            className="w-24 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <span className="text-[10.5px] text-zinc-400">=</span>
          <input
            name="conversion"
            type="number"
            min="0"
            step="any"
            placeholder="25000"
            required
            className="w-20 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <span className="text-[10.5px] text-zinc-400">{baseUnit}</span>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand-600 px-2 py-1 text-[10.5px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Tambah
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[10.5px] text-zinc-400 hover:text-zinc-600"
          >
            Batal
          </button>
        </form>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mt-1 text-[10.5px] font-medium text-brand-700 hover:underline"
        >
          + Satuan beli
        </button>
      )}
      {state.error && <p className="mt-1 text-[10.5px] text-red-600">{state.error}</p>}
    </div>
  );
}
