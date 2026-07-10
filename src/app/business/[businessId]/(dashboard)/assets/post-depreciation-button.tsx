"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PostDepreciationResult } from "./actions";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export default function PostDepreciationButton({
  action,
  period,
  estimatedAmount,
}: {
  action: (period: string) => Promise<PostDepreciationResult>;
  period: string;
  estimatedAmount: number;
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
        disabled={estimatedAmount <= 0}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {estimatedAmount > 0
          ? `📉 Posting Penyusutan Bulan Ini (${formatRupiah(estimatedAmount)})`
          : "Tidak ada penyusutan bulan ini"}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs">
      <p className="text-brand-700">
        Posting beban penyusutan {formatRupiah(estimatedAmount)} untuk periode {period.slice(0, 7)}{" "}
        ke jurnal (Beban Penyusutan / Akumulasi Penyusutan)? Bulan ini tidak bisa diposting dua kali.
      </p>
      <div className="flex gap-2">
        <button
          onClick={async () => {
            setPending(true);
            const result = await action(period);
            setPending(false);
            if (result.error) {
              setError(result.error);
              return;
            }
            setConfirming(false);
            router.refresh();
          }}
          disabled={pending}
          className="flex-1 rounded-lg bg-brand-600 py-2 font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Memproses…" : "Ya, Posting"}
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
