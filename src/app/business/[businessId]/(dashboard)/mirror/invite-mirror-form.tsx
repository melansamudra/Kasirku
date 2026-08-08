"use client";

import { useActionState, useRef, useEffect } from "react";
import type { InviteMirrorState } from "./actions";
import MirrorPermissionChecklist from "./mirror-permission-checklist";

const initialState: InviteMirrorState = { error: null };

export default function InviteMirrorForm({
  action,
}: {
  action: (state: InviteMirrorState, formData: FormData) => Promise<InviteMirrorState>;
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
        <label htmlFor="email" className="mb-1 block text-xs font-medium text-zinc-600">
          Email akun mirror
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          placeholder="contoh@email.com"
        />
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-zinc-600">Data yang boleh dilihat</p>
        <MirrorPermissionChecklist defaultValues={{ show_transactions: true, show_amount: true }} />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Mengirim undangan…" : "Undang Akun Mirror"}
      </button>
    </form>
  );
}
