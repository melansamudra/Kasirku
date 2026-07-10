"use client";

import { useActionState, useRef, useEffect } from "react";
import type { TransferState } from "./actions";

const initialState: TransferState = { error: null };

type AccountOption = { code: string; name: string };

export default function TransferForm({
  action,
  today,
  accounts,
}: {
  action: (state: TransferState, formData: FormData) => Promise<TransferState>;
  today: string;
  accounts: AccountOption[];
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
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="fromCode" className="mb-1 block text-xs font-medium text-zinc-600">
            Dari Akun
          </label>
          <select
            id="fromCode"
            name="fromCode"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="toCode" className="mb-1 block text-xs font-medium text-zinc-600">
            Ke Akun
          </label>
          <select
            id="toCode"
            name="toCode"
            defaultValue={accounts[1]?.code}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="date" className="mb-1 block text-xs font-medium text-zinc-600">
            Tanggal
          </label>
          <input
            id="date"
            name="date"
            type="date"
            defaultValue={today}
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label htmlFor="amount" className="mb-1 block text-xs font-medium text-zinc-600">
            Nominal (Rp)
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            min="0"
            step="1"
            placeholder="500000"
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-xs font-medium text-zinc-600">
          Keterangan (opsional)
        </label>
        <input
          id="description"
          name="description"
          type="text"
          placeholder="mis. Setor tunai ke BCA"
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
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
        {pending ? "Menyimpan…" : "🔀 Catat Transfer"}
      </button>
    </form>
  );
}
