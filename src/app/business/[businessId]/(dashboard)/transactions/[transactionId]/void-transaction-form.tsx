"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ownerVoidTransaction, staffVoidTransaction } from "./actions";

const VOID_REASONS = [
  "Salah input produk",
  "Permintaan pelanggan",
  "Kesalahan harga",
  "Duplikat transaksi",
  "Lainnya",
];

export default function VoidTransactionForm({
  businessId,
  transactionId,
  invoiceNumber,
  isOwner,
}: {
  businessId: string;
  transactionId: string;
  invoiceNumber: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(VOID_REASONS[0]);
  const [managerPin, setManagerPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 w-full rounded-xl border border-red-200 py-2.5 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50"
      >
        Batalkan Transaksi (Void)
      </button>
    );
  }

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    // Owner's own authenticated session is proof enough (owner_void_transaction).
    // Everyone else (business_staff) must additionally prove they're an active
    // manager-role cashier via PIN — owns_business() alone can't tell staff
    // apart from the real owner, so without this a staff member with just
    // "transactions" view permission could void exactly like the owner.
    const result = isOwner
      ? await ownerVoidTransaction(businessId, transactionId, invoiceNumber, reason)
      : await staffVoidTransaction(businessId, transactionId, invoiceNumber, managerPin, reason);
    setSubmitting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <div className="mt-4 rounded-2xl border border-red-200 bg-white p-4">
      <h2 className="text-sm font-bold text-zinc-900">⚠️ Konfirmasi Void Transaksi</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Stok produk dan bahan baku akan dikembalikan. Tindakan tidak dapat diurungkan.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="voidReason" className="mb-1 block text-xs font-medium text-zinc-600">
            Alasan Void
          </label>
          <select
            id="voidReason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {VOID_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {!isOwner && (
          <div>
            <label htmlFor="voidManagerPin" className="mb-1 block text-xs font-medium text-zinc-600">
              PIN Manajer
            </label>
            <input
              id="voidManagerPin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={managerPin}
              onChange={(e) => setManagerPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm tracking-widest focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
        )}

        <button
          onClick={handleConfirm}
          disabled={submitting || (!isOwner && managerPin.length < 4)}
          className="w-full rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Memproses…" : "Void Sekarang"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="w-full py-1 text-center text-xs font-medium text-zinc-400 hover:text-zinc-600"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
