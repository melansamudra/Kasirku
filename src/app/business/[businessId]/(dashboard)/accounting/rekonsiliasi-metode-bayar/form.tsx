"use client";

import { useActionState, useState } from "react";
import type { PaymentReconciliationState } from "./actions";

const initialState: PaymentReconciliationState = { error: null, resetToken: 0 };

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

export default function PaymentReconciliationForm({
  action,
  paymentMethod,
  periodStart,
  periodEnd,
  expectedAmount,
}: {
  action: (state: PaymentReconciliationState, formData: FormData) => Promise<PaymentReconciliationState>;
  paymentMethod: string;
  periodStart: string;
  periodEnd: string;
  expectedAmount: number;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [receivedAmount, setReceivedAmount] = useState("");

  const receivedNum = Number(receivedAmount);
  const hasValidInput = receivedAmount !== "" && !Number.isNaN(receivedNum);
  const difference = hasValidInput ? expectedAmount - receivedNum : null;

  return (
    <form action={formAction} className="space-y-3" key={state.resetToken}>
      <input type="hidden" name="paymentMethod" value={paymentMethod} />
      <input type="hidden" name="periodStart" value={periodStart} />
      <input type="hidden" name="periodEnd" value={periodEnd} />

      <div>
        <label className="text-xs font-medium text-zinc-600">
          Nominal yang benar-benar diterima di rekening
          <input
            name="receivedAmount"
            type="number"
            min="0"
            step="1"
            required
            value={receivedAmount}
            onChange={(e) => setReceivedAmount(e.target.value)}
            placeholder={String(expectedAmount)}
            className="mt-1 block w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
          />
        </label>
      </div>

      {difference !== null && (
        <div
          className={`rounded-lg px-3 py-2 text-xs ${
            Math.abs(difference) < 1
              ? "bg-brand-50 text-brand-700"
              : difference > 0
                ? "bg-red-50 text-red-700"
                : "bg-amber-50 text-amber-700"
          }`}
        >
          {Math.abs(difference) < 1
            ? "✓ Cocok, tidak ada selisih."
            : difference > 0
              ? `Selisih ${formatRupiah(difference)} — akan otomatis dicatat sebagai beban "Biaya Admin Bank/EDC".`
              : `Diterima Rp${formatRupiah(Math.abs(difference))} lebih besar dari sistem — akan dicatat sebagai riwayat saja (tidak otomatis diposting), cek manual dulu.`}
        </div>
      )}

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
        {pending ? "Menyimpan..." : "Simpan Rekonsiliasi"}
      </button>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
