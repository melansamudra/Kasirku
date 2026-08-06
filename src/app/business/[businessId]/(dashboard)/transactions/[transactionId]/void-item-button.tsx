"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { voidTransactionItem } from "./actions";

const VOID_REASONS = [
  "Salah input",
  "Permintaan pelanggan",
  "Habis / tidak tersedia",
  "Lainnya",
];

export default function VoidItemButton({
  businessId,
  transactionId,
  itemId,
  itemName,
  invoiceNumber,
}: {
  businessId: string;
  transactionId: string;
  itemId: string;
  itemName: string;
  invoiceNumber: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(VOID_REASONS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-red-400 hover:text-red-600"
      >
        Void
      </button>
    );
  }

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    const result = await voidTransactionItem(
      businessId, transactionId, itemId, itemName, invoiceNumber, reason,
    );
    setSubmitting(false);
    if (!result.success) { setError(result.error); return; }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3">
      <p className="mb-2 text-xs font-semibold text-red-700">
        Void: <span className="font-normal">{itemName}</span>
      </p>
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none"
      >
        {VOID_REASONS.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={submitting}
          className="flex-1 rounded-lg bg-red-600 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? "…" : "Konfirmasi Void"}
        </button>
        <button
          onClick={() => { setOpen(false); setError(null); }}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 hover:bg-white"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
