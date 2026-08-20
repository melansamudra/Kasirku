"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeductionsForm({
  action,
  initialKasbon,
  outstandingKasbon,
}: {
  action: (kasbonDeduction: number) => Promise<{ error: string | null }>;
  initialKasbon: number;
  outstandingKasbon: number;
}) {
  const router = useRouter();
  const [kasbon, setKasbon] = useState(initialKasbon > 0 ? String(initialKasbon) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    setError(null);
    setPending(true);
    const result = await action(Number(kasbon) || 0);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-xs font-semibold text-zinc-600">Potongan Kasbon</p>
      <p className="text-[11px] text-zinc-400">
        Potongan keterlambatan sudah otomatis dari data Absensi — bukan diisi manual di sini.
      </p>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-[10px] text-zinc-500">Potongan Kasbon (Rp)</label>
          <span className="text-[10px] text-zinc-400">
            Sisa kasbon: Rp{outstandingKasbon.toLocaleString("id-ID")}
          </span>
        </div>
        <input
          type="number"
          min="0"
          max={outstandingKasbon}
          step="1"
          value={kasbon}
          onChange={(e) => setKasbon(e.target.value)}
          placeholder="0"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Simpan Potongan Kasbon"}
      </button>
    </div>
  );
}
