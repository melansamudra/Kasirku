"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ImportProductsState } from "./actions";

const initialState: ImportProductsState = { error: null, result: null };

export default function ImportProductsForm({
  action,
}: {
  action: (state: ImportProductsState, formData: FormData) => Promise<ImportProductsState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="file"
          type="file"
          accept=".csv,text/csv"
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

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}

      {state.result && !pending && (
        <div className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
          <p>
            ✓ {state.result.created} produk baru, {state.result.updated} diperbarui
            {state.result.skipped > 0 && `, ${state.result.skipped} dilewati`}.
          </p>
          {state.result.errors.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-red-600">
              {state.result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
