"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MarkPaidResult } from "../actions";

export default function MarkPaidButton({
  action,
  totalDiterima,
}: {
  action: () => Promise<MarkPaidResult>;
  totalDiterima: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
        {error}
      </div>
    );
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
      >
        ✓ Tandai Sudah Dibayar
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs">
      <p className="text-brand-700">
        Tandai gaji ini sebagai sudah dibayar dan posting Rp
        {Math.round(totalDiterima).toLocaleString("id-ID")} ke jurnal (Beban Gaji / Kas &amp; Bank)?
        Slip tidak bisa diubah lagi setelah ini.
      </p>
      <div className="flex gap-2">
        <button
          onClick={async () => {
            setPending(true);
            const result = await action();
            setPending(false);
            if (result.error) {
              setError(result.error);
              return;
            }
            router.refresh();
          }}
          disabled={pending}
          className="flex-1 rounded-lg bg-brand-600 py-2 font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Memproses…" : "Ya, Sudah Dibayar"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded-lg px-3 py-2 font-medium text-zinc-500 hover:text-zinc-700"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
