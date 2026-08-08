"use client";

import { useState, useTransition } from "react";
import { revokeMirrorAccess } from "./actions";

export default function RevokeButton({
  businessId,
  mirrorAccountId,
  email,
}: {
  businessId: string;
  mirrorAccountId: string;
  email: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleRevoke() {
    startTransition(async () => {
      await revokeMirrorAccess(businessId, mirrorAccountId);
      setConfirm(false);
    });
  }

  if (!confirm) {
    return (
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="text-[11px] font-medium text-red-600 hover:underline"
      >
        Cabut Akses
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-zinc-500">Cabut akses {email}?</span>
      <button
        type="button"
        onClick={handleRevoke}
        disabled={isPending}
        className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-700 disabled:opacity-60"
      >
        {isPending ? "…" : "Ya"}
      </button>
      <button
        type="button"
        onClick={() => setConfirm(false)}
        className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-600"
      >
        Batal
      </button>
    </div>
  );
}
