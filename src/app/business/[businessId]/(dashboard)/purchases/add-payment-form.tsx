"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AddPaymentState } from "./actions";

export default function AddPaymentForm({
  today,
  sisaUtang,
  action,
}: {
  today: string;
  sisaUtang: number;
  action: (state: AddPaymentState, formData: FormData) => Promise<AddPaymentState>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(sisaUtang));
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
      >
        + Bayar
      </button>
    );
  }

  async function handleSubmit() {
    setError(null);
    setPending(true);
    const formData = new FormData();
    formData.set("date", date);
    formData.set("amount", amount);
    formData.set("note", note);
    const result = await action({ error: null }, formData);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <div className="mt-2 w-full space-y-2 rounded-xl border border-brand-200 bg-brand-50 p-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-800">Tanggal</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-brand-800">
            Jumlah Bayar (sisa {sisaUtang.toLocaleString("id-ID")})
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-brand-800">Catatan (opsional)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
        />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={pending}
          className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : "Catat Pembayaran"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-lg px-3 py-2 text-xs font-medium text-brand-700 hover:text-brand-900"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
