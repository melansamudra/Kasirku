"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LemburThrForm({
  action,
  initialLembur,
  initialThr,
}: {
  action: (lemburAmount: number, thrAmount: number) => Promise<{ error: string | null }>;
  initialLembur: number;
  initialThr: number;
}) {
  const router = useRouter();
  const [lembur, setLembur] = useState(initialLembur > 0 ? String(initialLembur) : "");
  const [thr, setThr] = useState(initialThr > 0 ? String(initialThr) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    setError(null);
    setPending(true);
    const result = await action(Number(lembur) || 0, Number(thr) || 0);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-xs font-semibold text-zinc-600">Lembur & THR</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[10px] text-zinc-500">Lembur (Rp)</label>
          <input
            type="number"
            min="0"
            step="1"
            value={lembur}
            onChange={(e) => setLembur(e.target.value)}
            placeholder="0"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] text-zinc-500">THR (Rp)</label>
          <input
            type="number"
            min="0"
            step="1"
            value={thr}
            onChange={(e) => setThr(e.target.value)}
            placeholder="0"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Simpan Lembur & THR"}
      </button>
    </div>
  );
}
