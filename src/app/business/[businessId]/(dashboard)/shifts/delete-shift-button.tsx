"use client";

import { useState, useTransition } from "react";
import { deleteShift } from "./actions";

export default function DeleteShiftButton({
  businessId,
  shiftId,
  label,
}: {
  businessId: string;
  shiftId: string;
  label: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await deleteShift(businessId, shiftId);
      setConfirm(false);
    });
  }

  if (!confirm) {
    return (
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="shrink-0 rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
      >
        Hapus
      </button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="text-[11px] text-zinc-500">Yakin hapus shift {label}?</span>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-700 disabled:opacity-60"
      >
        {isPending ? "Menghapus…" : "Ya, Hapus"}
      </button>
      <button
        type="button"
        onClick={() => setConfirm(false)}
        className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50"
      >
        Batal
      </button>
    </div>
  );
}
