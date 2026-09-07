"use client";

import { useActionState } from "react";
import type { ReservationState } from "./actions";

const initialState: ReservationState = { error: null, success: false };

export default function ReservationForm({
  action,
}: {
  action: (state: ReservationState, formData: FormData) => Promise<ReservationState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  if (state.success) {
    return (
      <p className="text-sm font-medium text-brand-700">
        ✓ Reservasi terkirim. Tim kami akan menghubungi kamu untuk konfirmasi.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="customerName"
          required
          placeholder="Nama"
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
        />
        <input
          name="phone"
          required
          placeholder="Nomor WhatsApp"
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          name="date"
          type="date"
          required
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
        />
        <input
          name="time"
          type="time"
          required
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
        />
        <input
          name="partySize"
          type="number"
          min="1"
          required
          placeholder="Jml tamu"
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
        />
      </div>
      <textarea
        name="note"
        placeholder="Catatan (opsional)"
        rows={2}
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Mengirim..." : "Kirim Reservasi"}
      </button>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
