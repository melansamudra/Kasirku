"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteSemiFinishedItem } from "./actions";

export default function DeleteItemButton({
  businessId,
  itemId,
  itemName,
}: {
  businessId: string;
  itemId: string;
  itemName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="shrink-0 text-xs text-zinc-400 hover:text-red-500"
        title="Hapus bahan setengah jadi"
      >
        🗑️
      </button>
    );
  }

  return (
    <div className="mt-2 flex w-full flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-red-600">Hapus {itemName}?</span>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={async () => {
              setPending(true);
              const result = await deleteSemiFinishedItem(businessId, itemId);
              setPending(false);
              if (result.error) {
                setError(result.error);
                return;
              }
              router.refresh();
            }}
            disabled={pending}
            className="rounded-lg bg-red-600 px-2 py-1 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Menghapus…" : "Ya, Hapus"}
          </button>
          <button
            onClick={() => {
              setConfirming(false);
              setError(null);
            }}
            className="rounded-lg px-2 py-1 font-medium text-zinc-500 hover:text-zinc-700"
          >
            Batal
          </button>
        </div>
      </div>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}
