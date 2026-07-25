"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeAdmin } from "./actions";

export default function RemoveButton({
  businessId,
  staffId,
  name,
}: {
  businessId: string;
  staffId: string;
  name: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (confirming) {
    return (
      <div className="flex shrink-0 items-center gap-1.5 text-xs">
        <span className="text-zinc-500">Hapus {name}?</span>
        <button
          onClick={() =>
            startTransition(async () => {
              await removeAdmin(businessId, staffId);
              router.refresh();
            })
          }
          disabled={pending}
          className="font-medium text-red-600 hover:underline disabled:opacity-50"
        >
          Ya, hapus
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-zinc-400 hover:text-zinc-600"
        >
          Batal
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="shrink-0 text-xs font-medium text-zinc-400 hover:text-red-500 hover:underline"
    >
      Hapus
    </button>
  );
}
