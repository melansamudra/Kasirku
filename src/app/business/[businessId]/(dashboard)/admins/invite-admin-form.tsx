"use client";

import { useActionState, useRef, useEffect } from "react";
import type { InviteAdminState } from "./actions";
import PermissionChecklist from "./permission-checklist";

const initialState: InviteAdminState = { error: null };

export default function InviteAdminForm({
  action,
}: {
  action: (state: InviteAdminState, formData: FormData) => Promise<InviteAdminState>;
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1 block text-xs font-medium text-zinc-600">
            Nama Admin
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="mis. Sari"
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-zinc-600">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="admin@email.com"
          />
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-zinc-600">Fitur yang boleh diakses</p>
        <PermissionChecklist />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Mengirim undangan…" : "Undang Admin"}
      </button>
    </form>
  );
}
