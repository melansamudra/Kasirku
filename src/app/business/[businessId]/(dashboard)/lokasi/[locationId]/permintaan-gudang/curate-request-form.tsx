"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CreateDeliveryNoteState } from "./actions";

type RequestItem = { id: string; itemName: string; unit: string | null; qtyRequested: number; qtySent: number };
type WarehouseItem = { id: string; name: string; unit: string; stock: number };

export default function CurateRequestForm({
  requestId,
  toLocationId,
  toLocationName,
  items,
  warehouseItems,
  employees,
  action,
}: {
  requestId: string;
  toLocationId: string;
  toLocationName: string;
  items: RequestItem[];
  warehouseItems: WarehouseItem[];
  employees: { id: string; name: string }[];
  action: (
    preparedBy: string,
    note: string,
    warehouseRequestId: string | null,
    lines: { warehouseItemId: string; requestItemId: string | null; qty: number }[],
  ) => Promise<CreateDeliveryNoteState>;
}) {
  const router = useRouter();
  const remaining = items.filter((it) => it.qtyRequested - it.qtySent > 0.001);
  const [picks, setPicks] = useState<Record<string, { warehouseItemId: string; qty: string }>>({});
  const [preparedBy, setPreparedBy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (remaining.length === 0) return null;

  async function handleSubmit() {
    setError(null);
    if (!preparedBy) {
      setError("Pilih nama yang menyiapkan barang dulu.");
      return;
    }
    const lines = remaining
      .map((it) => {
        const pick = picks[it.id];
        if (!pick || !pick.warehouseItemId || Number(pick.qty) <= 0) return null;
        return { warehouseItemId: pick.warehouseItemId, requestItemId: it.id, qty: Number(pick.qty) };
      })
      .filter((l): l is { warehouseItemId: string; requestItemId: string; qty: number } => l !== null);
    if (lines.length === 0) {
      setError("Pilih minimal satu barang untuk dikirim.");
      return;
    }
    setSubmitting(true);
    const result = await action(preparedBy, "", requestId, lines);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPicks({});
    router.refresh();
  }

  return (
    <div className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3">
      <p className="text-xs font-semibold text-zinc-700">Siapkan &amp; Kirim ke {toLocationName}</p>
      <div className="mt-2 space-y-1.5">
        {remaining.map((it) => {
          const remainingQty = it.qtyRequested - it.qtySent;
          const pick = picks[it.id] ?? { warehouseItemId: "", qty: "" };
          return (
            <div key={it.id} className="flex flex-wrap items-center gap-1.5">
              <p className="w-32 shrink-0 text-[11px] text-zinc-600">
                {it.itemName}
                <br />
                <span className="text-zinc-400">
                  diminta {remainingQty} {it.unit ?? ""}
                </span>
              </p>
              <select
                value={pick.warehouseItemId}
                onChange={(e) => setPicks((prev) => ({ ...prev, [it.id]: { ...pick, warehouseItemId: e.target.value } }))}
                className="min-w-[140px] flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] focus:border-brand-600 focus:outline-none"
              >
                <option value="">— pilih barang Gudang —</option>
                {warehouseItems.map((wi) => (
                  <option key={wi.id} value={wi.id} disabled={wi.stock <= 0}>
                    {wi.name} (stok {wi.stock} {wi.unit})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="Qty kirim"
                value={pick.qty}
                onChange={(e) => setPicks((prev) => ({ ...prev, [it.id]: { ...pick, qty: e.target.value } }))}
                className="w-20 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] focus:border-brand-600 focus:outline-none"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <select
          value={preparedBy}
          onChange={(e) => setPreparedBy(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] focus:border-brand-600 focus:outline-none"
        >
          <option value="">— Disiapkan oleh —</option>
          {employees.map((e) => (
            <option key={e.id} value={e.name}>
              {e.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? "Memproses…" : "Buat Surat Jalan"}
        </button>
      </div>
      {error && <p className="mt-1.5 rounded-lg bg-red-50 px-2 py-1.5 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
