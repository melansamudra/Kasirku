"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function UnmarkPaidButton({
  action,
}: {
  action: () => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <div className="mt-2 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
        <p className="text-xs text-red-700">
          Yakin batalkan pembayaran? Jurnal koreksi otomatis diposting (bukan dihapus), kasbon jadi
          belum lunas lagi, dan slip ini bisa diedit/dihapus lagi.
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={pending}
            className="flex-1 rounded-lg bg-red-600 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "Membatalkan…" : "Ya, Batalkan Pembayaran"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700"
          >
            Batal
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="mt-2 text-[11px] font-medium text-red-500 hover:underline"
    >
      Batalkan Pembayaran
    </button>
  );
}
