"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleBudgetGate } from "../permintaan-barang/actions";

export default function BudgetGateToggle({
  businessId,
  initialEnabled,
}: {
  businessId: string;
  initialEnabled: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    const next = !enabled;
    setError(null);
    setPending(true);
    toggleBudgetGate(businessId, next)
      .then((res) => {
        setPending(false);
        if (res.error) {
          setError(res.error);
          return;
        }
        setEnabled(next);
        router.refresh();
      })
      .catch(() => {
        setPending(false);
        setError("Gagal terhubung ke server. Cek koneksi internet lalu coba lagi.");
      });
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
      <label className="flex items-start gap-2.5 text-xs">
        <input
          type="checkbox"
          checked={enabled}
          onChange={handleToggle}
          disabled={pending}
          className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500"
        />
        <span>
          <span className="font-semibold text-zinc-800">Aktifkan Gerbang Budget</span>
          <span className="block text-[11px] text-zinc-500">
            Kalau aktif, tiap barang di Permintaan Barang harus disetujui Cost Control
            (APPROVED IN BUDGET) dulu sebelum Purchasing bisa alokasikan/teruskan ke supplier.
          </span>
        </span>
      </label>
      {error && <p className="mt-1.5 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
