"use client";

import { useActionState, useRef, useEffect } from "react";
import type { BudgetState } from "./actions";

const initialState: BudgetState = { error: null };

export default function SetBudgetForm({
  action,
  period,
  currentAmount,
}: {
  action: (state: BudgetState, formData: FormData) => Promise<BudgetState>;
  period: string;
  currentAmount: number;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-2.5">
      <input type="hidden" name="period" value={period} />
      <div className="min-w-[180px] flex-1">
        <label className="mb-1 block text-xs font-medium text-zinc-600">RAB Bulan {period}</label>
        <input
          name="amount"
          type="number"
          min="0"
          step="1"
          defaultValue={currentAmount || undefined}
          placeholder="mis. 50000000"
          required
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Simpan RAB"}
      </button>
      {state.error && <p className="w-full rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
