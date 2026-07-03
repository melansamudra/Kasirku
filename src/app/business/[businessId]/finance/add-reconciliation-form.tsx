"use client";

import { useActionState, useRef, useEffect } from "react";
import type { ReconciliationState } from "./actions";

const initialState: ReconciliationState = { error: null };

export default function AddReconciliationForm({
  action,
  methods,
  today,
}: {
  action: (state: ReconciliationState, formData: FormData) => Promise<ReconciliationState>;
  methods: string[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2.5">
      <p className="text-xs font-semibold text-zinc-600">
        + Catat Saldo Diterima Aktual (dari cek mutasi rekening/dashboard QRIS)
      </p>
      <div className="grid grid-cols-2 gap-2">
        <input
          name="date"
          type="date"
          defaultValue={today}
          required
          className="w-full rounded-lg border border-zinc-200 px-2.5 py-2 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <select
          name="method"
          required
          className="w-full rounded-lg border border-zinc-200 px-2.5 py-2 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          {methods.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          name="amount"
          type="number"
          min="0"
          step="1"
          placeholder="Jumlah diterima"
          required
          className="w-full rounded-lg border border-zinc-200 px-2.5 py-2 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <input
          name="note"
          type="text"
          placeholder="Catatan (opsional)"
          className="w-full rounded-lg border border-zinc-200 px-2.5 py-2 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
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
        {pending ? "Menyimpan…" : "+ Catat"}
      </button>
    </form>
  );
}
