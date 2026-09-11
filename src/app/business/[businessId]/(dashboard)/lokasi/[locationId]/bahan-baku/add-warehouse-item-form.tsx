"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AddWarehouseItemState } from "./actions";

export default function AddWarehouseItemForm({
  action,
}: {
  action: (name: string, unit: string, initialStock: number) => Promise<AddWarehouseItemState>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [stock, setStock] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    const result = await action(name, unit, Number(stock));
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setName("");
    setUnit("");
    setStock("0");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-3">
      <p className="text-xs font-semibold text-zinc-700">+ Tambah Barang Gudang</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <input
          type="text"
          placeholder="Nama barang (mis. Beras 25kg)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-[160px] flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <input
          type="text"
          placeholder="Satuan (mis. KG)"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="w-24 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <input
          type="number"
          min="0"
          step="any"
          placeholder="Stok awal"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          className="w-24 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          onClick={handleSubmit}
          disabled={submitting || !name.trim() || !unit.trim()}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Menyimpan…" : "Tambah"}
        </button>
      </div>
      {error && <p className="mt-1.5 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
