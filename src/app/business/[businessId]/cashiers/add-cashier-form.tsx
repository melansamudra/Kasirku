"use client";

import { useActionState, useRef, useEffect } from "react";
import type { AddCashierState } from "./actions";

const initialState: AddCashierState = { error: null };

export default function AddCashierForm({
  action,
}: {
  action: (state: AddCashierState, formData: FormData) => Promise<AddCashierState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name" className="mb-1 block text-xs font-medium text-zinc-600">
          Nama Kasir
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          placeholder="mis. Budi"
        />
      </div>

      <fieldset>
        <legend className="mb-2 block text-xs font-medium text-zinc-600">Peran</legend>
        <div className="flex gap-2">
          <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-200 py-2.5 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
            <input type="radio" name="role" value="kasir" defaultChecked required className="accent-brand-600" />
            Kasir
          </label>
          <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-200 py-2.5 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
            <input type="radio" name="role" value="manajer" required className="accent-brand-600" />
            Manajer
          </label>
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="pin" className="mb-1 block text-xs font-medium text-zinc-600">
            PIN (4 digit)
          </label>
          <input
            id="pin"
            name="pin"
            type="password"
            inputMode="numeric"
            maxLength={4}
            required
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-center text-sm tracking-widest focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="••••"
          />
        </div>
        <div>
          <label htmlFor="confirmPin" className="mb-1 block text-xs font-medium text-zinc-600">
            Ulangi PIN
          </label>
          <input
            id="confirmPin"
            name="confirmPin"
            type="password"
            inputMode="numeric"
            maxLength={4}
            required
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-center text-sm tracking-widest focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="••••"
          />
        </div>
      </div>

      <div>
        <label htmlFor="dailyRate" className="mb-1 block text-xs font-medium text-zinc-600">
          Gaji Harian (Rp, opsional)
        </label>
        <input
          id="dailyRate"
          name="dailyRate"
          type="number"
          min="0"
          step="1"
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          placeholder="mis. 100000"
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
        {pending ? "Menyimpan…" : "Tambah Kasir"}
      </button>
    </form>
  );
}
