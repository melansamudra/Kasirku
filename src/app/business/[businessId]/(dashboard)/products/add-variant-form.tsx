"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AddVariantsState } from "./actions";

type VariantRow = { label: string; price: string; cost: string };

export default function AddVariantForm({
  action,
}: {
  action: (state: AddVariantsState, formData: FormData) => Promise<AddVariantsState>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [variants, setVariants] = useState<VariantRow[]>([{ label: "", price: "", cost: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function update(i: number, field: keyof VariantRow, value: string) {
    setVariants((v) => v.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  }

  async function handleSubmit() {
    setError(null);
    setPending(true);
    const fd = new FormData();
    fd.set("variantsJson", JSON.stringify(variants));
    const result = await action({ error: null }, fd);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setVariants([{ label: "", price: "", cost: "" }]);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 py-2 text-xs font-medium text-zinc-500 transition-colors hover:border-brand-400 hover:text-brand-600"
      >
        + Tambah Varian
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <p className="mb-2 text-xs font-semibold text-zinc-700">Tambah Varian Baru</p>

      <div className="overflow-hidden rounded-lg border border-zinc-200">
        <div className="grid grid-cols-[1fr_90px_90px_28px] gap-px bg-zinc-100 px-2 py-1.5 text-[11px] font-semibold text-zinc-500">
          <span>Nama Varian</span>
          <span>Harga Jual</span>
          <span>Modal (HPP)</span>
          <span />
        </div>
        <div className="divide-y divide-zinc-100 bg-white">
          {variants.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_90px_28px] items-center gap-1 px-2 py-1.5">
              <input
                type="text"
                value={row.label}
                onChange={(e) => update(i, "label", e.target.value)}
                placeholder="mis. Nasi Merah"
                className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <input
                type="number"
                min="0"
                step="1"
                value={row.price}
                onChange={(e) => update(i, "price", e.target.value)}
                placeholder="45000"
                className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <input
                type="number"
                min="0"
                step="1"
                value={row.cost}
                onChange={(e) => update(i, "cost", e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
              <button
                type="button"
                onClick={() => setVariants((v) => v.filter((_, idx) => idx !== i))}
                disabled={variants.length <= 1}
                className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setVariants((v) => [...v, { label: "", price: "", cost: "" }])}
        className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 py-1.5 text-xs font-medium text-zinc-500 hover:border-brand-400 hover:text-brand-600"
      >
        + Baris Varian
      </button>

      {error && (
        <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600">{error}</p>
      )}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pending}
          className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : `Simpan ${variants.length} Varian`}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setVariants([{ label: "", price: "", cost: "" }]); setError(null); }}
          className="rounded-lg px-3 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-700"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
