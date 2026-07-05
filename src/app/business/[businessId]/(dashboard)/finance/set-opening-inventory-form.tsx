"use client";

import { useActionState, useRef, useEffect } from "react";
import type { OpeningInventoryState } from "./actions";

const initialState: OpeningInventoryState = { error: null };

export default function SetOpeningInventoryForm({
  action,
}: {
  action: (state: OpeningInventoryState, formData: FormData) => Promise<OpeningInventoryState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <div className="flex gap-2">
        <input
          name="value"
          type="number"
          min="0"
          step="1"
          placeholder="mis. 3500000"
          required
          className="w-full flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 whitespace-nowrap rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
