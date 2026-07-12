"use client";

import { useActionState, useEffect, useState } from "react";
import type { ActivateSubscriptionState } from "./actions";
import { PLANS } from "@/lib/billing/plans";

const initialState: ActivateSubscriptionState = { error: null, resetToken: 0 };

export default function ActivateSubscriptionForm({
  action,
}: {
  action: (state: ActivateSubscriptionState, formData: FormData) => Promise<ActivateSubscriptionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [open, setOpen] = useState(false);
  const [justSucceeded, setJustSucceeded] = useState(false);

  // Collapse back to the button + flash a success message right when a
  // submit succeeds (resetToken just went up with no error) — adjusted
  // during render, not in an effect, so it happens in the same paint as
  // the state update instead of one render later.
  const [prevResetToken, setPrevResetToken] = useState(state.resetToken);
  if (state.resetToken !== prevResetToken) {
    setPrevResetToken(state.resetToken);
    if (!state.error) {
      setOpen(false);
      setJustSucceeded(true);
    }
  }

  useEffect(() => {
    if (!justSucceeded) return;
    const timer = setTimeout(() => setJustSucceeded(false), 2500);
    return () => clearTimeout(timer);
  }, [justSucceeded]);

  if (!open) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-brand-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-brand-700"
        >
          Tandai Sudah Bayar
        </button>
        {justSucceeded && (
          <span className="text-[10px] font-medium text-brand-700">✓ Berhasil diaktifkan</span>
        )}
      </div>
    );
  }

  return (
    <form key={state.resetToken} action={formAction} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <select
          name="planCode"
          className="rounded-lg border border-zinc-200 px-1.5 py-1 text-[10px]"
        >
          {PLANS.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          name="note"
          type="text"
          placeholder="Catatan (opsional)"
          className="w-28 rounded-lg border border-zinc-200 px-1.5 py-1 text-[10px]"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "..." : "Konfirmasi"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[10px] text-zinc-400 hover:text-zinc-600"
        >
          Batal
        </button>
      </div>
      {state.error && <p className="text-[10px] text-red-600">{state.error}</p>}
    </form>
  );
}
