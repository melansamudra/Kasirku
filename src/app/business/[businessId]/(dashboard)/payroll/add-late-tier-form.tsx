"use client";

import { useActionState, useRef, useEffect } from "react";
import type { AddLateTierState } from "./actions";

const initialState: AddLateTierState = { error: null };

export default function AddLateTierForm({
  action,
}: {
  action: (state: AddLateTierState, formData: FormData) => Promise<AddLateTierState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[10px] text-zinc-500">Lebih dari (menit)</label>
          <input
            name="thresholdMinutes"
            type="number"
            min="0"
            step="1"
            required
            placeholder="mis. 5"
            className="w-full rounded-lg border border-zinc-200 px-2.5 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-zinc-500">Potongan (Rp)</label>
          <input
            name="amount"
            type="number"
            min="0"
            step="1"
            required
            placeholder="mis. 10000"
            className="w-full rounded-lg border border-zinc-200 px-2.5 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      {state.error && <p className="text-xs text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-zinc-800 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "+ Tambah Tingkatan"}
      </button>
    </form>
  );
}
