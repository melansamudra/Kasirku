"use client";

import { useActionState, useEffect, useRef } from "react";
import type { UploadState } from "./upload-actions";

const initialState: UploadState = { error: null, report: null };

export default function UploadForm({
  action,
}: {
  action: (state: UploadState, formData: FormData) => Promise<UploadState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error && state.report) {
      formRef.current?.reset();
    }
  }, [pending, state.error, state.report]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div>
        <label htmlFor="file" className="mb-1 block text-xs font-medium text-zinc-600">
          File Excel (.xlsx)
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".xlsx"
          required
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700"
        />
        <p className="mt-1 text-[11px] text-zinc-400">
          Sheet manapun yang punya kolom &quot;Nama Menu&quot;, &quot;Bahan Baku&quot;, &quot;Gramasi&quot;
          (&amp; &quot;Porsi&quot;) — nama sheet bebas, kalau ada yang namanya mengandung
          &quot;dataglobal&quot; itu yang dipakai duluan. Bahan baku yang belum ada di sistem otomatis
          dibuat baru.
        </p>
      </div>

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>}
      {state.report && !pending && (
        <div className="space-y-1 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
          <p>
            Berhasil: {state.report.itemCount} menu, {state.report.rowCount} baris bahan tersimpan.
          </p>
          {state.report.newIngredients.length > 0 && (
            <p>Bahan baku baru dibuat: {state.report.newIngredients.join(", ")}</p>
          )}
          {state.report.skippedRows > 0 && (
            <p className="text-amber-700">{state.report.skippedRows} baris dilewati (data tidak lengkap).</p>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Mengunggah…" : "Upload"}
      </button>
    </form>
  );
}
