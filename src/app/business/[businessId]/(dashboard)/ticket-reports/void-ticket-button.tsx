"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { voidTicketTransaction } from "../../pos/ticket-actions";

export default function VoidTicketButton({
  businessId,
  transactionId,
}: {
  businessId: string;
  transactionId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] font-medium text-red-600 hover:underline"
      >
        Void
      </button>
    );
  }

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    const result = await voidTicketTransaction(businessId, transactionId, pin, reason);
    setSubmitting(false);

    if (!result.success) {
      setError(result.error);
      setPin("");
      return;
    }

    router.refresh();
  }

  return (
    <div className="relative">
      <div className="absolute right-0 top-0 z-10 w-64 rounded-xl border border-red-200 bg-white p-3 shadow-lg">
        <p className="text-xs font-semibold text-zinc-900">Batalkan tiket ini?</p>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Alasan (opsional)"
          className="mt-2 w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="PIN Manajer"
          className="mt-2 w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-center text-sm font-bold tracking-widest focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        {error && <p className="mt-1.5 text-[11px] text-red-600">{error}</p>}
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => {
              setOpen(false);
              setError(null);
              setPin("");
            }}
            className="flex-1 rounded-lg border border-zinc-200 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Batal
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting || pin.length < 4}
            className="flex-1 rounded-lg bg-red-600 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Memproses…" : "Void"}
          </button>
        </div>
      </div>
    </div>
  );
}
