"use client";

import { useTransition } from "react";

export default function StatusButtons({
  businessId,
  reservationId,
  status,
  action,
}: {
  businessId: string;
  reservationId: string;
  status: string;
  action: (businessId: string, reservationId: string, status: string) => Promise<{ error?: string }>;
}) {
  const [pending, startTransition] = useTransition();

  function setStatus(next: string) {
    startTransition(async () => {
      await action(businessId, reservationId, next);
    });
  }

  return (
    <div className="mt-2 flex gap-1.5">
      {status !== "confirmed" && status !== "selesai" && status !== "cancelled" && (
        <button
          onClick={() => setStatus("confirmed")}
          disabled={pending}
          className="rounded-lg border border-brand-200 px-2 py-1 text-[10px] font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
        >
          Konfirmasi
        </button>
      )}
      {status !== "selesai" && status !== "cancelled" && (
        <button
          onClick={() => setStatus("selesai")}
          disabled={pending}
          className="rounded-lg border border-zinc-200 px-2 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
        >
          Selesai
        </button>
      )}
      {status !== "cancelled" && status !== "selesai" && (
        <button
          onClick={() => setStatus("cancelled")}
          disabled={pending}
          className="rounded-lg border border-red-200 px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Batalkan
        </button>
      )}
    </div>
  );
}
