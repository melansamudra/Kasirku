"use client";

import { useActionState, useRef, useEffect } from "react";
import type { BudgetState } from "./actions";

const initialState: BudgetState = { error: null };

type Account = { id: string; code: string; name: string };

export default function AddBudgetForm({
  action,
  period,
  accounts,
}: {
  action: (state: BudgetState, formData: FormData) => Promise<BudgetState>;
  period: string;
  accounts: Account[];
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
      <input type="hidden" name="period" value={period} />
      <div className="grid grid-cols-2 gap-2.5">
        <select
          name="accountId"
          required
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} — {a.name}
            </option>
          ))}
        </select>
        <input
          name="amount"
          type="number"
          min="0"
          step="1"
          placeholder="Target (Rp)"
          required
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "+ Set Target"}
      </button>
    </form>
  );
}
