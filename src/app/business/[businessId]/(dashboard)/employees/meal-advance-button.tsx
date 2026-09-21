"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { addMealAdvance, type AddMealAdvanceState } from "./actions";

const initialState: AddMealAdvanceState = { error: null };

export default function MealAdvanceButton({
  businessId,
  employeeId,
  quota,
  taken,
}: {
  businessId: string;
  employeeId: string;
  quota: number;
  taken: number;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = addMealAdvance.bind(null, businessId, employeeId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const remaining = Math.max(0, quota - taken);

  useEffect(() => {
    if (!pending && !state.error && formRef.current) {
      formRef.current.reset();
    }
  }, [pending, state.error]);

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-emerald-600 hover:underline"
      >
        Uang Makan: sisa Rp{remaining.toLocaleString("id-ID")}
        {taken > 0 && ` (sudah diambil Rp${taken.toLocaleString("id-ID")})`}
      </button>

      {open && (
        <form
          ref={formRef}
          action={formAction}
          className="mt-2 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3"
        >
          <p className="text-[11px] text-zinc-400">
            Tunai keluar sekarang & langsung tercatat sebagai Beban Gaji. Sisa jatah bulan ini
            otomatis masuk slip gaji saat dibuat.
          </p>
          <input
            name="amount"
            type="number"
            min="1"
            step="1"
            required
            placeholder="Nominal diambil (Rp)"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <input
            name="note"
            type="text"
            placeholder="Catatan (opsional)"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {state.error && <p className="text-xs text-red-600">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Menyimpan…" : "Catat Pengambilan"}
          </button>
        </form>
      )}
    </div>
  );
}
