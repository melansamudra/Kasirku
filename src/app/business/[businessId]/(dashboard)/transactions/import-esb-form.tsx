"use client";

import { useActionState, useCallback, useEffect, useRef } from "react";
import type { ImportEsbState } from "./esb-actions";

const initialState: ImportEsbState = { error: null, result: null };

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

export default function ImportEsbForm({
  action,
}: {
  action: (state: ImportEsbState, formData: FormData) => Promise<ImportEsbState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  const handleSuccess = useCallback(() => {
    formRef.current?.reset();
  }, []);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <ResetOnSuccess pending={pending} hasError={!!state.error} hasResult={!!state.result} onSuccess={handleSuccess} />

      <div>
        <label htmlFor="esb-note" className="mb-1 block text-xs font-medium text-zinc-600">
          Catatan (opsional)
        </label>
        <input
          id="esb-note"
          name="note"
          type="text"
          placeholder="Kosongkan untuk pakai nomor bill ESB sebagai catatan"
          className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          name="file"
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
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
            ✓ {state.result.transactionCount} transaksi dibuat — {state.result.itemCount} baris menu total.
          </p>
          {state.result.createdProducts.length > 0 && (
            <p className="mt-1">
              🆕 {state.result.createdProducts.length} produk baru dibuat otomatis:{" "}
              {state.result.createdProducts.join(", ")}.
            </p>
          )}
          {state.result.skippedCount > 0 && (
            <p className="mt-1 text-amber-600">
              ⚠ {state.result.skippedCount} transaksi dilewati (kemungkinan duplikat dari impor sebelumnya).
            </p>
          )}
          {state.result.warnings.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-600">
              {state.result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
