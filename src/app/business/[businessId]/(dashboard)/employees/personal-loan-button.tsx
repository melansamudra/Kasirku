"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { addPersonalLoan, type AddPersonalLoanState } from "./actions";

const initialState: AddPersonalLoanState = { error: null };

export default function PersonalLoanButton({
  businessId,
  employeeId,
  outstanding,
}: {
  businessId: string;
  employeeId: string;
  outstanding: number;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = addPersonalLoan.bind(null, businessId, employeeId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

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
        className="text-xs font-medium text-amber-600 hover:underline"
      >
        {outstanding > 0 ? `Pinjaman Pribadi: Rp${outstanding.toLocaleString("id-ID")}` : "+ Pinjaman Pribadi"}
      </button>

      {open && (
        <form
          ref={formRef}
          action={formAction}
          className="mt-2 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3"
        >
          <p className="text-[11px] text-zinc-400">
            Cuma catatan/tanda — tidak lewat Kas Kecil, tidak menyentuh kas atau jurnal. Nominal
            potongannya dipilih nanti per-slip di halaman detail slip gaji.
          </p>
          <input
            name="amount"
            type="number"
            min="1"
            step="1"
            required
            placeholder="Nominal pinjaman (Rp)"
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
            className="w-full rounded-lg bg-amber-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Menyimpan…" : "Catat Pinjaman"}
          </button>
        </form>
      )}
    </div>
  );
}
