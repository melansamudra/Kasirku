"use client";

import { useActionState, useRef, useEffect } from "react";
import type { PaymentMethodState } from "./actions";

const initialState: PaymentMethodState = { error: null };

export default function AddPaymentMethodForm({
  action,
}: {
  action: (state: PaymentMethodState, formData: FormData) => Promise<PaymentMethodState>;
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
      <div className="flex gap-2">
        <input
          name="name"
          type="text"
          required
          placeholder="mis. Dana, OVO, Transfer BCA"
          className="w-full flex-1 rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 whitespace-nowrap rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : "+ Tambah"}
        </button>
      </div>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
