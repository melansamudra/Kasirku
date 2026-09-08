"use client";

import { useState, useTransition } from "react";
import { verifyOpnameEntry, rejectOpnameEntry } from "./actions";

export default function EntryActions({ businessId, entryId }: { businessId: string; entryId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [applyToStock, setApplyToStock] = useState(false);

  function handleVerify() {
    setError(null);
    startTransition(async () => {
      const result = await verifyOpnameEntry(businessId, entryId, applyToStock);
      if (result.error) setError(result.error);
    });
  }

  function handleReject() {
    if (!window.confirm("Tolak hasil opname ini? Stok tidak akan diubah.")) return;
    setError(null);
    startTransition(async () => {
      const result = await rejectOpnameEntry(businessId, entryId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <label className="flex items-center gap-1.5 text-[10px] text-zinc-500">
        <input
          type="checkbox"
          checked={applyToStock}
          onChange={(e) => setApplyToStock(e.target.checked)}
          className="h-3 w-3 rounded border-zinc-300"
        />
        Sesuaikan stok sistem
      </label>
      <div className="flex gap-1.5">
        <button
          onClick={handleVerify}
          disabled={pending}
          className="rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Verifikasi
        </button>
        <button
          onClick={handleReject}
          disabled={pending}
          className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
        >
          Tolak
        </button>
      </div>
      {error && <p className="text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
