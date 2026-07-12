"use client";

import { useActionState } from "react";
import type { BusinessTypeState } from "./actions";

const initialState: BusinessTypeState = { error: null, saved: false };

const OPTIONS: { value: string; label: string }[] = [
  { value: "fnb", label: "🍽️ F&B" },
  { value: "retail", label: "🛒 Retail" },
  { value: "tiket", label: "🎟️ Tempat Wisata / Tiket" },
];

export default function BusinessTypeForm({
  action,
  businessType,
}: {
  action: (state: BusinessTypeState, formData: FormData) => Promise<BusinessTypeState>;
  businessType: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <select
        name="businessType"
        defaultValue={businessType}
        className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state.saved && !state.error && !pending && (
        <p className="text-xs text-brand-700">✓ Jenis usaha diperbarui.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Simpan"}
      </button>
    </form>
  );
}
