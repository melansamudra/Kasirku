"use client";

import { useTransition } from "react";
import { blockTableForDate, unblockTable } from "./actions";

export default function TableBlockButton({
  businessId,
  tableId,
  date,
  blockedReservationId,
}: {
  businessId: string;
  tableId: string;
  date: string;
  blockedReservationId: string | null;
}) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      if (blockedReservationId) {
        await unblockTable(businessId, blockedReservationId);
      } else {
        await blockTableForDate(businessId, tableId, date);
      }
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold disabled:opacity-50 ${
        blockedReservationId
          ? "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
          : "border border-red-200 text-red-600 hover:bg-red-50"
      }`}
    >
      {blockedReservationId ? "Buka Lagi" : "Blokir"}
    </button>
  );
}
