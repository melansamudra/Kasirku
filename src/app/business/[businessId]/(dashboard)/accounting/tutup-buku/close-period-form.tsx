"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ClosePeriodResult } from "./actions";

export default function ClosePeriodForm({
  businessId,
  defaultPeriodEnd,
  action,
}: {
  businessId: string;
  defaultPeriodEnd: string;
  action: (businessId: string, periodEnd: string) => Promise<ClosePeriodResult>;
}) {
  const router = useRouter();
  const [periodEnd, setPeriodEnd] = useState(defaultPeriodEnd);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    const result = await action(businessId, periodEnd);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setConfirming(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="periodEnd" className="mb-1 block text-xs font-medium text-zinc-600">
          Tutup Buku Sampai Tanggal
        </label>
        <input
          id="periodEnd"
          type="date"
          value={periodEnd}
          onChange={(e) => {
            setPeriodEnd(e.target.value);
            setConfirming(false);
            setError(null);
          }}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          🔒 Tutup Buku
        </button>
      ) : (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <p>
            Ini akan meng-nol-kan saldo semua akun Pendapatan &amp; Beban sampai{" "}
            <strong>{periodEnd}</strong> dan memindahkan labanya ke Laba Ditahan. Setelah ditutup,
            transaksi bertanggal sebelum {periodEnd} sebaiknya tidak diinput lagi — kesalahan
            dibetulkan lewat jurnal koreksi, bukan mengubah data lama.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={pending}
              className="flex-1 rounded-lg bg-brand-600 py-2 font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Memproses…" : "Ya, Tutup Buku"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-lg px-3 py-2 font-medium text-amber-700 hover:text-amber-900"
            >
              Batal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
