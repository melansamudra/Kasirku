"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const REASONS = [
  "Stok opname",
  "Rusak/kadaluarsa",
  "Hilang/dicuri",
  "Kesalahan input awal",
  "Lainnya",
];

type PurchaseUnit = { unitName: string; conversion: number };

export default function AdjustStockForm({
  itemName,
  currentStock,
  unit,
  purchaseUnits,
  action,
}: {
  itemName: string;
  currentStock: number;
  unit?: string;
  // Opsional -- kalau bahan ini punya "Satuan Beli" terdaftar (mis. "KG" =
  // 1000 gr), munculkan pilihan satuan di sini juga, sama pola dengan form
  // Pembelian. Angka yang diketik otomatis dikonversi ke satuan dasar
  // sebelum dikirim ke `action` -- action-nya sendiri TIDAK berubah, tetap
  // cuma terima angka di satuan dasar seperti sebelumnya.
  purchaseUnits?: PurchaseUnit[];
  action: (newStock: number, reason: string) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newStock, setNewStock] = useState(String(currentStock));
  const [inputUnit, setInputUnit] = useState(unit ?? "");
  const [reason, setReason] = useState(REASONS[0]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const unitSuffix = unit ? ` ${unit}` : "";
  const selectedVariant = (purchaseUnits ?? []).find((u) => u.unitName === inputUnit);
  const baseValue = selectedVariant ? (Number(newStock) || 0) * selectedVariant.conversion : Number(newStock) || 0;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 text-xs font-medium text-zinc-400 hover:text-brand-600 hover:underline"
      >
        Sesuaikan stok
      </button>
    );
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    const result = await action(baseValue, reason);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <div className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-xs text-zinc-500">
        Sesuaikan stok <span className="font-medium text-zinc-700">{itemName}</span> — stok
        sistem saat ini {currentStock}
        {unitSuffix}.
      </p>
      <div className="mt-2 space-y-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Stok fisik sebenarnya</label>
          <div className="flex gap-1.5">
            <input
              type="number"
              min="0"
              step="any"
              value={newStock}
              onChange={(e) => setNewStock(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            {purchaseUnits && purchaseUnits.length > 0 ? (
              <select
                value={inputUnit}
                onChange={(e) => setInputUnit(e.target.value)}
                className="shrink-0 rounded-lg border border-zinc-200 px-2 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                {unit && <option value={unit}>{unit}</option>}
                {purchaseUnits.map((u) => (
                  <option key={u.unitName} value={u.unitName}>
                    {u.unitName}
                  </option>
                ))}
              </select>
            ) : (
              unitSuffix && <span className="flex shrink-0 items-center text-xs text-zinc-500">{unit}</span>
            )}
          </div>
          {selectedVariant && (
            <p className="mt-1 text-[10.5px] text-zinc-400">
              = {baseValue} {unit} (1 {selectedVariant.unitName} = {selectedVariant.conversion} {unit})
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Alasan</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Menyimpan…" : "Simpan"}
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
    </div>
  );
}
