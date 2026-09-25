"use client";

import { useActionState, useRef, useEffect } from "react";
import type { AddPrepaidExpenseState } from "./actions";

const initialState: AddPrepaidExpenseState = { error: null };

export default function AddPrepaidExpenseForm({
  action,
  today,
  expenseAccounts,
}: {
  action: (state: AddPrepaidExpenseState, formData: FormData) => Promise<AddPrepaidExpenseState>;
  today: string;
  expenseAccounts: { code: string; name: string }[];
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
        <label htmlFor="name" className="mb-1 block text-xs font-medium text-zinc-600">
          Nama Biaya
        </label>
        <input
          id="name"
          name="name"
          type="text"
          placeholder="mis. Langganan POS Kasir 1 Tahun"
          required
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="paymentDate" className="mb-1 block text-xs font-medium text-zinc-600">
            Tanggal Bayar
          </label>
          <input
            id="paymentDate"
            name="paymentDate"
            type="date"
            defaultValue={today}
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label htmlFor="totalAmount" className="mb-1 block text-xs font-medium text-zinc-600">
            Total Dibayar (Rp)
          </label>
          <input
            id="totalAmount"
            name="totalAmount"
            type="number"
            min="0"
            step="1"
            placeholder="2199000"
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="amortizationMonths" className="mb-1 block text-xs font-medium text-zinc-600">
            Dicicil Berapa Bulan
          </label>
          <input
            id="amortizationMonths"
            name="amortizationMonths"
            type="number"
            min="1"
            step="1"
            placeholder="12"
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label htmlFor="expenseAccountCode" className="mb-1 block text-xs font-medium text-zinc-600">
            Masuk Akun Beban
          </label>
          <select
            id="expenseAccountCode"
            name="expenseAccountCode"
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">Pilih akun…</option>
            {expenseAccounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="-mt-1 text-[11px] text-zinc-400">
        Tiap bulan, cicilan biaya ini otomatis diposting ke akun beban yang dipilih di atas. Belum ada
        akun yang cocok? Buat dulu di Akuntansi → Daftar Akun.
      </p>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "+ Tambah Biaya Dibayar Dimuka"}
      </button>
    </form>
  );
}
