"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { todayWibDateString } from "@/lib/wib";
import type { ImportSalesRecapState } from "./rekap-actions";

const initialState: ImportSalesRecapState = { error: null, result: null };
const PAYMENT_METHODS = ["Tunai", "Kartu", "QRIS"];

// Effect ini murni pemicu (bukan pemilik state yang direset) -- lint
// react-hooks/set-state-in-effect menolak setState langsung di badan
// useEffect komponen yang sama, jadi reset field (formRef + paymentMethod)
// didelegasikan lewat prop `onSuccess`, bukan dipanggil literal di sini.
function ResetOnSuccess({
  pending,
  hasError,
  hasResult,
  onSuccess,
}: {
  pending: boolean;
  hasError: boolean;
  hasResult: boolean;
  onSuccess: () => void;
}) {
  useEffect(() => {
    if (!pending && !hasError && hasResult) {
      onSuccess();
    }
  }, [pending, hasError, hasResult, onSuccess]);
  return null;
}

// Terpisah jadi komponen sendiri supaya bisa di-remount lewat `key` --
// cara paling bersih buat reset pilihan tombol ke default tanpa nyimpen
// balik setState di efek pemanggilnya.
function PaymentMethodField() {
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  return (
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
  );
}

export default function ImportSalesRecapForm({
  action,
}: {
  action: (state: ImportSalesRecapState, formData: FormData) => Promise<ImportSalesRecapState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [fieldsResetToken, setFieldsResetToken] = useState(0);

  const handleSuccess = useCallback(() => {
    formRef.current?.reset();
    setFieldsResetToken((n) => n + 1);
  }, []);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <ResetOnSuccess pending={pending} hasError={!!state.error} hasResult={!!state.result} onSuccess={handleSuccess} />

      <div>
        <label htmlFor="recap-date" className="mb-1 block text-xs font-medium text-zinc-600">
          Tanggal Default
        </label>
        <input
          id="recap-date"
          name="date"
          type="date"
          required
          defaultValue={todayWibDateString()}
          className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
        />
        <p className="mt-1 text-[10.5px] text-zinc-400">
          Dipakai buat baris yang kolom Tanggal-nya dikosongkan di file. Kalau file punya Tanggal
          per baris, baris dengan tanggal sama digabung jadi 1 transaksi (bisa banyak transaksi
          sekaligus, sesuai berapa tanggal berbeda di file).
        </p>
      </div>

      <PaymentMethodField key={fieldsResetToken} />

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
            ✓ {state.result.transactionCount} transaksi rekap dibuat ({state.result.invoiceNumbers.join(", ")}) —{" "}
            {state.result.itemCount} baris menu total.
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
