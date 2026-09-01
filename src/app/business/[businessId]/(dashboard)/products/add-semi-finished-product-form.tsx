"use client";

import { useActionState, useState } from "react";
import type { SemiFinishedProductState } from "./semi-finished-product-actions";

const initialState: SemiFinishedProductState = { error: null };

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export default function AddSemiFinishedProductForm({
  action,
  options,
}: {
  action: (state: SemiFinishedProductState, formData: FormData) => Promise<SemiFinishedProductState>;
  options: { id: string; name: string; unit: string; unitCost: number }[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [selectedId, setSelectedId] = useState("");
  const [targetPct, setTargetPct] = useState("30");
  const [price, setPrice] = useState("");

  if (options.length === 0) {
    return (
      <p className="text-xs text-zinc-400">
        Semua Bahan Setengah Jadi sudah punya produk terhubung, atau belum ada Bahan Setengah Jadi
        yang dibuat.
      </p>
    );
  }

  const selected = options.find((o) => o.id === selectedId) ?? null;
  const pct = Number(targetPct);
  const recommendation =
    selected && pct > 0 ? selected.unitCost / (pct / 100) : null;

  return (
    <form action={formAction} className="space-y-3" key={options.length}>
      <div>
        <label htmlFor="semiFinishedItemId" className="mb-1 block text-xs font-medium text-zinc-600">
          Bahan Setengah Jadi
        </label>
        <select
          id="semiFinishedItemId"
          name="semiFinishedItemId"
          required
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">— Pilih —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({o.unit})
            </option>
          ))}
        </select>
        {selected && (
          <p className="mt-1 text-xs text-zinc-500">HPP: {formatRupiah(selected.unitCost)} / {selected.unit}</p>
        )}
      </div>

      {selected && (
        <div>
          <label htmlFor="targetPct" className="mb-1 block text-xs font-medium text-zinc-600">
            Target Food Cost %
          </label>
          <div className="flex items-center gap-2">
            <input
              id="targetPct"
              type="number"
              min="1"
              max="99"
              step="1"
              value={targetPct}
              onChange={(e) => setTargetPct(e.target.value)}
              className="w-20 rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <span className="text-xs text-zinc-500">%</span>
          </div>
          {recommendation !== null && (
            <p className="mt-1.5 flex items-center gap-2 text-xs text-zinc-500">
              Harga rekomendasi: <span className="font-medium text-zinc-800">{formatRupiah(recommendation)}</span>
              <button
                type="button"
                onClick={() => setPrice(String(Math.round(recommendation)))}
                className="font-medium text-brand-600 hover:underline"
              >
                Pakai
              </button>
            </p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="price" className="mb-1 block text-xs font-medium text-zinc-600">
          Harga Jual
        </label>
        <input
          id="price"
          name="price"
          type="number"
          min="1"
          step="1"
          required
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          placeholder="mis. 25000"
        />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "+ Tambah Produk"}
      </button>
    </form>
  );
}
