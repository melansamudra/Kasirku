"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { todayWibDateString } from "@/lib/wib";
import type { ImportSalesRecapState } from "./rekap-actions";

const initialState: ImportSalesRecapState = { error: null, result: null };
const PAYMENT_METHODS = ["Tunai", "Kartu", "QRIS"];

export default function ImportSalesRecapForm({
  action,
}: {
  action: (state: ImportSalesRecapState, formData: FormData) => Promise<ImportSalesRecapState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
      setPaymentMethod(PAYMENT_METHODS[0]);
    }
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div>
        <label htmlFor="recap-date" className="mb-1 block text-xs font-medium text-zinc-600">
          Tanggal (semua item digabung jadi 1 transaksi di tanggal ini)
        </label>
        <input
          id="recap-date"
          name="date"
          type="date"
          required
          defaultValue={todayWibDateString()}
          className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Metode Bayar</label>
        <div className="flex flex-wrap gap-1.5">
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPaymentMethod(m)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                paymentMethod === m ? "bg-brand-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <input type="hidden" name="paymentMethod" value={paymentMethod} />
        <p className="mt-1 text-[10.5px] text-zinc-400">
          Rekap begini biasanya campuran banyak metode bayar — pilih salah satu representatif saja,
          ini cuma buat isi kolom wajib.
        </p>
      </div>

      <div>
        <label htmlFor="recap-note" className="mb-1 block text-xs font-medium text-zinc-600">
          Catatan (opsional)
        </label>
        <input
          id="recap-note"
          name="note"
          type="text"
          placeholder="mis. Rekap ESB Juni 2026"
          className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          name="file"
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          required
          className="flex-1 text-xs text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-zinc-700 hover:file:bg-zinc-200"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Mengimpor…" : "Impor"}
        </button>
      </div>

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>}

      {state.result && !pending && (
        <div className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
          <p>
            ✓ 1 transaksi rekap dibuat ({state.result.invoiceNumber}) — {state.result.itemCount} menu.
          </p>
          {state.result.createdProducts.length > 0 && (
            <p className="mt-1">
              🆕 {state.result.createdProducts.length} Produk Jadi baru dibuat otomatis:{" "}
              {state.result.createdProducts.join(", ")}.
            </p>
          )}
          {state.result.skipped.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-600">
              {state.result.skipped.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
