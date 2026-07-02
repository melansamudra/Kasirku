"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { openShift } from "./actions";
import SwitchCashierButton from "./switch-cashier-button";

export default function OpenShiftScreen({
  businessId,
  businessName,
  cashierId,
  cashierName,
}: {
  businessId: string;
  businessName: string;
  cashierId: string;
  cashierName: string;
}) {
  const router = useRouter();
  const [openingCash, setOpeningCash] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const amount = Number(openingCash);
    if (!openingCash || Number.isNaN(amount) || amount < 0) {
      setError("Modal awal harus angka dan tidak boleh negatif.");
      return;
    }

    setSubmitting(true);
    const result = await openShift(businessId, cashierId, amount, notes);
    setSubmitting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600">
            <span className="text-lg font-bold text-white">🟢</span>
          </div>
          <h1 className="text-lg font-bold text-zinc-900">Mulai Shift</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {cashierName} — {businessName}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Belum ada shift aktif. Catat modal awal di laci sebelum mulai jualan.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="openingCash" className="mb-1 block text-xs font-medium text-zinc-600">
              Modal Awal (Rp)
            </label>
            <input
              id="openingCash"
              type="number"
              min="0"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              required
              className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              placeholder="mis. 300000"
            />
          </div>
          <div>
            <label htmlFor="notes" className="mb-1 block text-xs font-medium text-zinc-600">
              Catatan (opsional)
            </label>
            <input
              id="notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              placeholder="mis. Shift pagi"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Memproses…" : "Mulai Shift"}
          </button>
        </form>

        <SwitchCashierButton />
      </div>
    </div>
  );
}
