"use client";

import { useActionState, useState } from "react";
import type { SetPinState } from "../../../employees/actions";

const initialState: SetPinState = { error: null };

export default function SetPinButton({
  action,
  hasPin,
}: {
  action: (state: SetPinState, formData: FormData) => Promise<SetPinState>;
  hasPin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, initialState);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] font-medium text-zinc-400 hover:text-brand-600"
      >
        {hasPin ? "✓ Ganti PIN Portal" : "Set PIN Portal"}
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <input
        name="pin"
        type="password"
        inputMode="numeric"
        maxLength={4}
        placeholder="PIN baru"
        className="w-20 rounded-lg border border-zinc-200 px-2 py-1 text-xs focus:border-brand-600 focus:outline-none"
      />
      <input
        name="confirmPin"
        type="password"
        inputMode="numeric"
        maxLength={4}
        placeholder="Ulangi PIN"
        className="w-20 rounded-lg border border-zinc-200 px-2 py-1 text-xs focus:border-brand-600 focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Menyimpan…" : "Simpan"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-[11px] text-zinc-400 hover:text-zinc-600"
      >
        Batal
      </button>
      {state.error && <p className="w-full text-[11px] text-red-600">{state.error}</p>}
    </form>
  );
}
