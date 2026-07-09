"use client";

import { useActionState, useRef, useEffect } from "react";
import type { AccountState } from "./actions";

const initialState: AccountState = { error: null };

const TYPES = [
  { value: "aset", label: "Aset" },
  { value: "kewajiban", label: "Kewajiban" },
  { value: "modal", label: "Modal" },
  { value: "pendapatan", label: "Pendapatan" },
  { value: "beban", label: "Beban" },
];

export default function AddAccountForm({
  action,
}: {
  action: (state: AccountState, formData: FormData) => Promise<AccountState>;
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
      <div className="grid grid-cols-3 gap-2.5">
        <input
          name="code"
          type="text"
          placeholder="Kode (mis. 5-105)"
          required
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <input
          name="name"
          type="text"
          placeholder="Nama akun"
          required
          className="col-span-2 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <select
        name="type"
        required
        className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      >
        {TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "+ Tambah Akun"}
      </button>
    </form>
  );
}
