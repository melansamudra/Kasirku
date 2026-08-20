"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EditIngredientState } from "./actions";

export default function EditIngredientForm({
  name,
  unit,
  unitCost,
  minStock,
  purchaseUnit,
  purchaseConversion,
  action,
}: {
  name: string;
  unit: string;
  unitCost: number;
  minStock: number;
  purchaseUnit: string | null;
  purchaseConversion: number | null;
  action: (state: EditIngredientState, formData: FormData) => Promise<EditIngredientState>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({
    name,
    unit,
    unitCost: String(unitCost),
    minStock: String(minStock),
    purchaseUnit: purchaseUnit ?? "",
    purchaseConversion: purchaseConversion !== null ? String(purchaseConversion) : "",
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
    formData.set("unit", values.unit);
    formData.set("unitCost", values.unitCost);
    formData.set("minStock", values.minStock);
    formData.set("purchaseUnit", values.purchaseUnit);
    formData.set("purchaseConversion", values.purchaseConversion);
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
        <label className="mb-1 block text-xs font-medium text-zinc-600">Nama Bahan</label>
        <input
          type="text"
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Satuan</label>
          <input
            type="text"
            value={values.unit}
            onChange={(e) => setValues((v) => ({ ...v, unit: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Harga/Satuan</label>
          <input
            type="number"
            min="0"
            step="1"
            value={values.unitCost}
            onChange={(e) => setValues((v) => ({ ...v, unitCost: e.target.value }))}
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
      <div className="rounded-lg bg-white p-2.5">
        <p className="mb-1.5 text-[10.5px] font-medium text-zinc-500">
          Satuan Beli (opsional) — kosongkan kalau belinya langsung dalam satuan stok di atas.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Satuan Beli</label>
            <input
              type="text"
              value={values.purchaseUnit}
              onChange={(e) => setValues((v) => ({ ...v, purchaseUnit: e.target.value }))}
              placeholder="Sak"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Isi per Satuan Beli</label>
            <input
              type="number"
              min="0"
              step="any"
              value={values.purchaseConversion}
              onChange={(e) => setValues((v) => ({ ...v, purchaseConversion: e.target.value }))}
              placeholder="25000"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>
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
