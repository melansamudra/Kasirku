"use client";

import { useActionState } from "react";
import type { BulkTableState } from "./actions";

const init: BulkTableState = { error: null, created: 0 };

export default function BulkAddTableForm({
  action,
}: {
  action: (state: BulkTableState, formData: FormData) => Promise<BulkTableState>;
}) {
  const [state, formAction, pending] = useActionState(action, init);

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Awalan</label>
          <input
            name="prefix"
            type="text"
            placeholder="Meja "
            defaultValue="Meja "
            required
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Dari nomor</label>
          <input
            name="start"
            type="number"
            min="1"
            defaultValue="1"
            required
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Sampai nomor</label>
          <input
            name="end"
            type="number"
            min="1"
            defaultValue="10"
            required
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>
      <p className="text-[11px] text-zinc-400">
        Contoh: awalan &quot;Meja &quot; dari 1 sampai 10 → Meja 1, Meja 2, … Meja 10
      </p>
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}
      {state.created > 0 && !state.error && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
          {state.created} meja berhasil dibuat.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Membuat…" : "Buat Massal"}
      </button>
    </form>
  );
}
