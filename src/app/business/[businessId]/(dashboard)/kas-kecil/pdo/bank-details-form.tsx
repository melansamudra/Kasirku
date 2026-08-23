"use client";

import { useActionState } from "react";
import type { BankDetailsState } from "./actions";

const initialState: BankDetailsState = { error: null };

export default function BankDetailsForm({
  action,
  bankName,
  accountNumber,
  accountHolder,
}: {
  action: (state: BankDetailsState, formData: FormData) => Promise<BankDetailsState>;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form
      // Remount tiap kali nilai tersimpan berubah (setelah revalidatePath)
      // supaya defaultValue ikut ke-refresh -- input tidak controlled.
      key={`${bankName}|${accountNumber}|${accountHolder}`}
      action={formAction}
      className="grid grid-cols-1 gap-2.5 sm:grid-cols-3"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Bank</label>
        <input
          name="bankName"
          defaultValue={bankName}
          placeholder="mis. BCA"
          className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Nomor Rekening</label>
        <input
          name="accountNumber"
          defaultValue={accountNumber}
          placeholder="mis. 1234567890"
          className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Atas Nama</label>
        <input
          name="accountHolder"
          defaultValue={accountHolder}
          placeholder="mis. Adi Setiawan"
          className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div className="flex items-center justify-between gap-2 sm:col-span-3">
        {state.error && <p className="text-xs text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="ml-auto shrink-0 rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </form>
  );
}
