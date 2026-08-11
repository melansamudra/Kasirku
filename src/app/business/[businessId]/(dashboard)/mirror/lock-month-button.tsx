"use client";

import { useTransition } from "react";
import { lockMirrorMonth, unlockMirrorMonth } from "./actions";

export default function LockMonthButton({
  businessId,
  monthYear,
  locked,
  label,
}: {
  businessId: string;
  monthYear: string;
  locked: boolean;
  label: string;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    const msg = locked
      ? `Buka kunci ${label}?\nTanda transaksi bulan ini bisa diubah kembali.`
      : `Kunci ${label}?\nTanda transaksi bulan ini tidak bisa diubah sampai dibuka kembali.`;
    if (!confirm(msg)) return;

    startTransition(async () => {
      if (locked) {
        await unlockMirrorMonth(businessId, monthYear);
      } else {
        await lockMirrorMonth(businessId, monthYear);
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
        locked
          ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
          : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
      }`}
    >
      {locked ? "🔒 Terkunci" : "🔓 Kunci Bulan"}
    </button>
  );
}
