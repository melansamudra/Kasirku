"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { voidTicketTransaction } from "../../../pos/ticket-actions";

export default function VoidTicketTransactionForm({
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
        className="mt-4 w-full rounded-xl border border-red-200 py-2.5 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50"
      >
        Batalkan Tiket (Void)
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
    <div className="mt-4 rounded-2xl border border-red-200 bg-white p-4">
      <h2 className="text-sm font-bold text-zinc-900">⚠️ Konfirmasi Void Tiket</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Masukkan PIN manajer untuk membatalkan transaksi ini. Nomor seri tiket tetap tercatat
        (tidak dipakai ulang) karena tiket fisik sudah terlanjur diberikan. Tindakan tidak
        dapat diurungkan.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="voidReason" className="mb-1 block text-xs font-medium text-zinc-600">
            Alasan Void (opsional)
          </label>
          <input
            id="voidReason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="mis. Salah input, permintaan pelanggan"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div>
          <label htmlFor="voidPin" className="mb-1 block text-xs font-medium text-zinc-600">
            PIN Manajer
          </label>
          <input
            id="voidPin"
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-center text-lg font-bold tracking-widest focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
        )}

        <button
          onClick={handleConfirm}
          disabled={submitting || pin.length < 4}
          className="w-full rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Memproses…" : "Void Sekarang"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setError(null);
            setPin("");
          }}
          className="w-full py-1 text-center text-xs font-medium text-zinc-400 hover:text-zinc-600"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
