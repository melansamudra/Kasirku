"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CreatePaymentRequestState } from "../pengajuan-pembayaran/actions";

export default function RequestPaymentForm({
  businessId,
  sisaUtang,
  action,
}: {
  businessId: string;
  sisaUtang: number;
  action: (state: CreatePaymentRequestState, formData: FormData) => Promise<CreatePaymentRequestState>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(sisaUtang));
  const [paymentMethod, setPaymentMethod] = useState<"tunai" | "transfer">("transfer");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
      >
        Ajukan Pembayaran
      </button>
    );
  }

  async function handleSubmit() {
    setError(null);
    setPending(true);
    const formData = new FormData();
    formData.set("amount", amount);
    formData.set("paymentMethod", paymentMethod);
    formData.set("note", note);
    const result = await action({ error: null, requestId: null }, formData);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.requestId) {
      router.push(`/business/${businessId}/purchases/pengajuan-pembayaran/${result.requestId}`);
    }
  }

  return (
    <div className="mt-2 w-full space-y-2 rounded-xl border border-brand-200 bg-brand-50 p-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-brand-800">
          Jumlah Diajukan (sisa {sisaUtang.toLocaleString("id-ID")})
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
      <div>
        <label className="mb-1 block text-xs font-medium text-brand-800">Metode Bayar</label>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setPaymentMethod("tunai")}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
              paymentMethod === "tunai" ? "bg-zinc-800 text-white" : "bg-white text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            💵 Tunai
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod("transfer")}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
              paymentMethod === "transfer" ? "bg-zinc-800 text-white" : "bg-white text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            🏦 Transfer
          </button>
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
          {pending ? "Mengajukan…" : "Ajukan ke Owner"}
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
