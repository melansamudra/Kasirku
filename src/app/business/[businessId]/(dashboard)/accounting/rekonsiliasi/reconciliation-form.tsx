"use client";

import { useActionState } from "react";
import type { AddReconciliationState } from "./actions";

const initialState: AddReconciliationState = { error: null, resetToken: 0 };

type AccountOption = { id: string; code: string; name: string };

export default function ReconciliationForm({
  action,
  today,
  accounts,
  selectedAccountId,
}: {
  action: (state: AddReconciliationState, formData: FormData) => Promise<AddReconciliationState>;
  today: string;
  accounts: AccountOption[];
  selectedAccountId: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form key={state.resetToken} action={formAction} className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="accountId" className="mb-1 block text-xs font-medium text-zinc-600">
            Akun
          </label>
          <select
            id="accountId"
            name="accountId"
            defaultValue={selectedAccountId}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="statementDate" className="mb-1 block text-xs font-medium text-zinc-600">
            Per Tanggal
          </label>
          <input
            id="statementDate"
            name="statementDate"
            type="date"
            defaultValue={today}
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      <div>
        <label htmlFor="statementBalance" className="mb-1 block text-xs font-medium text-zinc-600">
          Saldo Menurut Rekening Koran / Kas Fisik (Rp)
        </label>
        <input
          id="statementBalance"
          name="statementBalance"
          type="number"
          step="1"
          placeholder="1500000"
          required
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div>
        <label htmlFor="note" className="mb-1 block text-xs font-medium text-zinc-600">
          Catatan (opsional)
        </label>
        <input
          id="note"
          name="note"
          type="text"
          placeholder="mis. ada 1 transfer belum settle"
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
        {pending ? "Menyimpan…" : "🏦 Simpan Rekonsiliasi"}
      </button>
    </form>
  );
}
