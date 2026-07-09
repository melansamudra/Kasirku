"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAccount } from "./actions";

export default function DeleteAccountButton({
  businessId,
  accountId,
  accountName,
}: {
  businessId: string;
  accountId: string;
  accountName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="shrink-0 text-xs text-zinc-400 hover:text-red-500"
        title="Hapus akun"
      >
        🗑️
      </button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2 text-xs">
      <span className="text-red-600">Hapus {accountName}?</span>
      <button
        onClick={async () => {
          setPending(true);
          await deleteAccount(businessId, accountId);
          router.refresh();
        }}
        disabled={pending}
        className="rounded-lg bg-red-600 px-2 py-1 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "…" : "Ya"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="rounded-lg px-2 py-1 font-medium text-zinc-500 hover:text-zinc-700"
      >
        Batal
      </button>
    </div>
  );
}
