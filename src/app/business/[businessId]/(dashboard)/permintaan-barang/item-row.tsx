"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { assignItemSupplier, updateItemApprovedQty } from "./actions";

type Supplier = { id: string; name: string };

export default function ItemRow({
  businessId,
  suppliers,
  item,
}: {
  businessId: string;
  suppliers: Supplier[];
  item: {
    id: string;
    itemName: string;
    unit: string | null;
    qtyOrdered: number;
    currentStock: number | null;
    supplierId: string | null;
    approvedQty: number | null;
    forwardedAt: string | null;
  };
}) {
  const router = useRouter();
  const qtyInputId = useId();
  const [approvedQty, setApprovedQty] = useState(String(item.approvedQty ?? item.qtyOrdered));
  const [supplierId, setSupplierId] = useState(item.supplierId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
  const finalQty = item.approvedQty ?? item.qtyOrdered;
  const qtyWasAdjusted = item.approvedQty !== null && item.approvedQty !== item.qtyOrdered;

  function handleSaveQty() {
    const qty = Number(approvedQty);
    if (!approvedQty || Number.isNaN(qty) || qty < 0) {
      setError("Qty disetujui harus angka 0 atau lebih.");
      return;
    }
    setError(null);
    setPending(true);
    updateItemApprovedQty(businessId, item.id, qty).then((res) => {
      setPending(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleSupplierChange(value: string) {
    setSupplierId(value);
    setError(null);
    setPending(true);
    assignItemSupplier(businessId, item.id, value).then((res) => {
      setPending(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  if (item.forwardedAt) {
    return (
      <div className="flex items-center justify-between px-3 py-2 text-sm">
        <div>
          <p className="text-zinc-800">{item.itemName}</p>
          <p className="text-[10.5px] text-brand-700">
            ✓ Diteruskan ke {supplierMap.get(item.supplierId ?? "")?.name ?? "supplier"}
          </p>
        </div>
        <p className="font-medium text-zinc-900">
          {finalQty}
          {item.unit ? ` ${item.unit}` : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-zinc-800">{item.itemName}</p>
        <div className="shrink-0 text-right text-sm">
          {qtyWasAdjusted && (
            <span className="mr-1 text-zinc-400 line-through">
              {item.qtyOrdered}
              {item.unit ? ` ${item.unit}` : ""}
            </span>
          )}
          <span className="font-medium text-zinc-900">
            {finalQty}
            {item.unit ? ` ${item.unit}` : ""}
          </span>
        </div>
      </div>
      {item.currentStock !== null && (
        <p className="text-[10.5px] text-zinc-400">Stok saat ini: {item.currentStock}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor={qtyInputId} className="text-[11px] text-zinc-500">
          Qty disetujui:
        </label>
        <input
          id={qtyInputId}
          type="number"
          min="0"
          step="any"
          value={approvedQty}
          onChange={(e) => setApprovedQty(e.target.value)}
          onBlur={handleSaveQty}
          disabled={pending}
          className="w-20 rounded-lg border border-zinc-200 px-2 py-1 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />

        <select
          value={supplierId}
          onChange={(e) => handleSupplierChange(e.target.value)}
          disabled={pending}
          className="rounded-lg border border-zinc-200 px-2 py-1 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">— Pilih supplier —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
