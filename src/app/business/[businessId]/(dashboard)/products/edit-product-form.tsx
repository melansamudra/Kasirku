"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EditProductState } from "./actions";

export default function EditProductForm({
  name,
  category,
  price,
  cost,
  minStock,
  emoji,
  barcode,
  sku,
  variantLabel,
  action,
}: {
  name: string;
  category: string | null;
  price: number;
  cost: number;
  minStock: number;
  emoji: string | null;
  barcode: string | null;
  sku: string | null;
  variantLabel: string | null;
  action: (state: EditProductState, formData: FormData) => Promise<EditProductState>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({
    name,
    category: category ?? "",
    price: String(price),
    cost: String(cost),
    minStock: String(minStock),
    emoji: emoji ?? "",
    barcode: barcode ?? "",
    sku: sku ?? "",
    variantLabel: variantLabel ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 text-xs font-medium text-zinc-400 hover:text-brand-600 hover:underline"
      >
        Edit
      </button>
    );
  }

  async function handleSubmit() {
    setError(null);
    setPending(true);
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("category", values.category);
    formData.set("price", values.price);
    formData.set("cost", values.cost);
    formData.set("minStock", values.minStock);
    formData.set("emoji", values.emoji);
    formData.set("barcode", values.barcode);
    formData.set("sku", values.sku);
    formData.set("variantLabel", values.variantLabel);
    const result = await action({ error: null }, formData);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <div className="mt-2 w-full space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Nama Produk</label>
        <input
          type="text"
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Barcode</label>
          <input
            type="text"
            value={values.barcode}
            onChange={(e) => setValues((v) => ({ ...v, barcode: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">SKU</label>
          <input
            type="text"
            value={values.sku}
            onChange={(e) => setValues((v) => ({ ...v, sku: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">
          Varian (mis. Merah / S)
        </label>
        <input
          type="text"
          value={values.variantLabel}
          onChange={(e) => setValues((v) => ({ ...v, variantLabel: e.target.value }))}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Kategori</label>
          <input
            type="text"
            value={values.category}
            onChange={(e) => setValues((v) => ({ ...v, category: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Ikon (emoji)</label>
          <input
            type="text"
            maxLength={4}
            value={values.emoji}
            onChange={(e) => setValues((v) => ({ ...v, emoji: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-center text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Harga Jual</label>
          <input
            type="number"
            min="0"
            step="1"
            value={values.price}
            onChange={(e) => setValues((v) => ({ ...v, price: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Modal (HPP)</label>
          <input
            type="number"
            min="0"
            step="1"
            value={values.cost}
            onChange={(e) => setValues((v) => ({ ...v, cost: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">
          Stok Minimum (0 = tanpa notifikasi)
        </label>
        <input
          type="number"
          min="0"
          step="1"
          value={values.minStock}
          onChange={(e) => setValues((v) => ({ ...v, minStock: e.target.value }))}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={pending}
          className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : "Simpan"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-lg px-3 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-700"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
