"use client";

import { useState } from "react";
import { saveBudgetLine } from "./actions";

function formatQty(value: number) {
  return Number(value.toFixed(2)).toLocaleString("id-ID");
}
function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export default function BudgetLineRow({
  businessId,
  period,
  ingredientId,
  name,
  unit,
  unitCost,
  suggestedQty,
  initialOrderQty,
}: {
  businessId: string;
  period: string;
  ingredientId: string;
  name: string;
  unit: string;
  unitCost: number;
  suggestedQty: number;
  initialOrderQty: number;
}) {
  const [orderQty, setOrderQty] = useState(String(initialOrderQty));
  const [saved, setSaved] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const qty = Number(orderQty);
    if (!Number.isFinite(qty) || qty < 0) {
      setError("Harus angka 0 atau lebih.");
      return;
    }
    setError(null);
    setPending(true);
    saveBudgetLine(businessId, period, ingredientId, qty)
      .then((res) => {
        setPending(false);
        if (res.error) {
          setError(res.error);
          return;
        }
        setSaved(true);
      })
      .catch(() => {
        setPending(false);
        setError("Gagal terhubung ke server.");
      });
  }

  const subtotal = (Number(orderQty) || 0) * unitCost;

  return (
    <div className="flex items-center gap-2 border-b border-zinc-50 py-2 text-xs last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-zinc-800">{name}</p>
        <p className="text-[10.5px] text-zinc-400">
          Acuan: {formatQty(suggestedQty)} {unit} · {formatRupiah(unitCost)}/{unit}
        </p>
      </div>
      <div className="w-24 shrink-0">
        <input
          type="number"
          min="0"
          step="0.01"
          value={orderQty}
          onChange={(e) => {
            setOrderQty(e.target.value);
            setSaved(false);
          }}
          onBlur={handleSave}
          className={`w-full rounded-lg border px-2 py-1.5 text-right text-[11px] focus:border-brand-600 focus:outline-none ${
            saved ? "border-zinc-200" : "border-amber-300"
          }`}
        />
      </div>
      <div className="w-24 shrink-0 text-right font-semibold text-zinc-700">
        {pending ? "…" : formatRupiah(subtotal)}
      </div>
      {error && <p className="w-full text-[10px] text-red-600">{error}</p>}
    </div>
  );
}
