"use client";

import { useActionState, useState } from "react";
import type { TaxServiceState } from "./actions";

const initialState: TaxServiceState = { error: null, saved: false };

export default function TaxServiceForm({
  action,
  taxEnabled,
  taxRate,
  serviceEnabled,
  serviceRate,
}: {
  action: (state: TaxServiceState, formData: FormData) => Promise<TaxServiceState>;
  taxEnabled: boolean;
  taxRate: number;
  serviceEnabled: boolean;
  serviceRate: number;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [taxOn, setTaxOn] = useState(taxEnabled);
  const [serviceOn, setServiceOn] = useState(serviceEnabled);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-900">PPN</span>
          <input
            name="taxEnabled"
            type="checkbox"
            checked={taxOn}
            onChange={(e) => setTaxOn(e.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
        </label>
        {taxOn && (
          <div className="mt-2 flex items-center gap-2">
            <input
              name="taxRate"
              type="number"
              min="0"
              max="100"
              step="0.5"
              defaultValue={taxRate}
              className="w-24 rounded-xl border border-zinc-200 px-3.5 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <span className="text-sm text-zinc-500">%</span>
          </div>
        )}
        <p className="mt-1 text-xs text-zinc-400">
          PPN dihitung dari subtotal setelah diskon (plus biaya layanan jika aktif).
        </p>
      </div>

      <div className="border-t border-zinc-100 pt-4">
        <label className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-900">Biaya Layanan (Service)</span>
          <input
            name="serviceEnabled"
            type="checkbox"
            checked={serviceOn}
            onChange={(e) => setServiceOn(e.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
        </label>
        {serviceOn && (
          <div className="mt-2 flex items-center gap-2">
            <input
              name="serviceRate"
              type="number"
              min="0"
              max="100"
              step="0.5"
              defaultValue={serviceRate}
              className="w-24 rounded-xl border border-zinc-200 px-3.5 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <span className="text-sm text-zinc-500">%</span>
          </div>
        )}
      </div>

      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      {state.saved && !state.error && !pending && (
        <p className="text-xs text-brand-700">✓ Tersimpan.</p>
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
