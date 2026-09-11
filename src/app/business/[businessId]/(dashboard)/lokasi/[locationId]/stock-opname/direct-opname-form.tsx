"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { todayWibDateString } from "@/lib/wib";
import type { OpnameActionState } from "./actions";

type ItemRow = { id: string; name: string; unit: string; currentStock: number };

export default function DirectOpnameForm({
  ingredients,
  action,
  label = "bahan",
}: {
  ingredients: ItemRow[];
  action: (
    counts: { itemId: string; itemName: string; unit: string; reportedStock: number }[],
    entryDate: string,
  ) => Promise<OpnameActionState>;
  label?: string;
}) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [entryDate, setEntryDate] = useState(todayWibDateString());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function setCount(id: string, value: string) {
    setCounts((prev) => ({ ...prev, [id]: value }));
    setSuccess(false);
  }

  async function handleSubmit() {
    const filled = ingredients
      .filter((i) => counts[i.id] !== undefined && counts[i.id] !== "")
      .map((i) => ({
        itemId: i.id,
        itemName: i.name,
        unit: i.unit,
        reportedStock: Number(counts[i.id]),
      }));

    if (filled.length === 0) {
      setError(`Isi minimal 1 ${label} dengan jumlah stok fisiknya.`);
      return;
    }

    setError(null);
    setSubmitting(true);
    const result = await action(filled, entryDate);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setCounts({});
    setSuccess(true);
    router.refresh();
  }

  return (
    <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Input Stok Opname</h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        Isi stok fisik hasil hitung — cuma {label} yang diisi yang diajukan. Perubahan stok baru
        berlaku setelah diverifikasi.
      </p>

      <label className="mt-3 block text-xs font-medium text-zinc-600">
        Tanggal opname (fisik dihitung)
        <input
          type="date"
          value={entryDate}
          max={todayWibDateString()}
          onChange={(e) => setEntryDate(e.target.value)}
          className="mt-1 block rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </label>

      <div className="mt-3 max-h-96 space-y-1.5 overflow-y-auto">
        {ingredients.map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-zinc-800">{i.name}</p>
              <p className="text-[10.5px] text-zinc-400">
                Stok sistem: {i.currentStock} {i.unit}
              </p>
            </div>
            <input
              type="number"
              min="0"
              step="any"
              value={counts[i.id] ?? ""}
              onChange={(e) => setCount(i.id, e.target.value)}
              placeholder="0"
              className="w-24 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-right text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
        ))}
      </div>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-600">{error}</p>}
      {success && (
        <p className="mt-2 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs text-brand-700">
          Laporan opname terkirim — menunggu verifikasi.
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-3 w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Mengirim…" : "Ajukan Stok Opname"}
      </button>
    </div>
  );
}
