"use client";

import { useState, useTransition } from "react";
import { verifyStockOpnameEntry, rejectStockOpnameEntry, verifyAllPendingForDate } from "./actions";

export function VerifyEntryButtons({
  businessId,
  locationId,
  entryId,
}: {
  businessId: string;
  locationId: string;
  entryId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await verifyStockOpnameEntry(businessId, locationId, entryId);
              if (res.error) setError(res.error);
            })
          }
          className="rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Verifikasi
        </button>
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await rejectStockOpnameEntry(businessId, locationId, entryId);
              if (res.error) setError(res.error);
            })
          }
          className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-500 hover:text-red-600 disabled:opacity-50"
        >
          Tolak
        </button>
      </div>
      {error && <p className="text-[10px] text-red-600">{error}</p>}
    </div>
  );
}

export function VerifyAllButton({
  businessId,
  locationId,
  entryDate,
  count,
}: {
  businessId: string;
  locationId: string;
  entryDate: string;
  count: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await verifyAllPendingForDate(businessId, locationId, entryDate);
            if (res.error) setError(res.error);
          })
        }
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Memproses…" : `Verifikasi Semua (${count})`}
      </button>
      {error && <p className="mt-1 text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
