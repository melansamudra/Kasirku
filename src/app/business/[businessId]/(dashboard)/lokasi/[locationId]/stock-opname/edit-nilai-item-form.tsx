"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OpnameActionState } from "./actions";

export default function EditNilaiItemForm({
  currentStock,
  currentUnit,
  action,
}: {
  currentStock: number;
  currentUnit: string;
  action: (newStock: number, newUnit: string) => Promise<OpnameActionState>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stock, setStock] = useState(String(currentStock));
  const [unit, setUnit] = useState(currentUnit);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 text-[10px] font-medium text-zinc-400 hover:text-brand-600 hover:underline"
      >
        Sesuaikan
      </button>
    );
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    const result = await action(Number(stock), unit);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <input
          type="number"
          min="0"
          step="any"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          className="w-20 rounded-lg border border-zinc-200 px-2 py-1 text-right text-[11px] focus:border-brand-600 focus:outline-none"
        />
        <input
          type="text"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="w-14 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] focus:border-brand-600 focus:outline-none"
        />
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-lg bg-brand-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? "…" : "Simpan"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[10px] text-zinc-400 hover:text-zinc-600"
        >
          Batal
        </button>
      </div>
      {error && <p className="text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
