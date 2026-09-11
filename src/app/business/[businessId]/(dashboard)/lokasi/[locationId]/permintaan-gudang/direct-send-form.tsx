"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CreateDeliveryNoteState } from "./actions";

type WarehouseItem = { id: string; name: string; unit: string; stock: number };
type Row = { warehouseItemId: string; qty: string };

export default function DirectSendForm({
  toLocations,
  warehouseItems,
  employees,
  action,
}: {
  toLocations: { id: string; name: string }[];
  warehouseItems: WarehouseItem[];
  employees: { id: string; name: string }[];
  action: (
    toLocationId: string,
    preparedBy: string,
    note: string,
    warehouseRequestId: null,
    lines: { warehouseItemId: string; requestItemId: null; qty: number }[],
  ) => Promise<CreateDeliveryNoteState>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toLocationId, setToLocationId] = useState(toLocations[0]?.id ?? "");
  const [preparedBy, setPreparedBy] = useState("");
  const [rows, setRows] = useState<Row[]>([{ warehouseItemId: "", qty: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (toLocations.length === 0) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 text-xs font-medium text-brand-600 hover:underline"
      >
        + Kirim langsung (tanpa permintaan)
      </button>
    );
  }

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function handleSubmit() {
    setError(null);
    if (!toLocationId) {
      setError("Pilih lokasi tujuan dulu.");
      return;
    }
    if (!preparedBy) {
      setError("Pilih nama yang menyiapkan barang dulu.");
      return;
    }
    const lines = rows
      .filter((r) => r.warehouseItemId && Number(r.qty) > 0)
      .map((r) => ({ warehouseItemId: r.warehouseItemId, qty: Number(r.qty) }));
    if (lines.length === 0) {
      setError("Pilih minimal satu barang dengan qty > 0.");
      return;
    }
    setSubmitting(true);
    const result = await action(
      toLocationId,
      preparedBy,
      "",
      null,
      lines.map((l) => ({ ...l, requestItemId: null })),
    );
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setRows([{ warehouseItemId: "", qty: "" }]);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3">
      <p className="text-xs font-semibold text-zinc-700">Kirim Langsung (tanpa permintaan)</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <select
          value={toLocationId}
          onChange={(e) => setToLocationId(e.target.value)}
          className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
        >
          {toLocations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2 space-y-1.5">
        {rows.map((row, idx) => (
          <div key={idx} className="flex flex-wrap gap-1.5">
            <select
              value={row.warehouseItemId}
              onChange={(e) => updateRow(idx, { warehouseItemId: e.target.value })}
              className="min-w-[160px] flex-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
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
              placeholder="Qty"
              value={row.qty}
              onChange={(e) => updateRow(idx, { qty: e.target.value })}
              className="w-20 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
            />
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                className="text-xs text-zinc-400 hover:text-red-600"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, { warehouseItemId: "", qty: "" }])}
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          + Tambah baris
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <select
          value={preparedBy}
          onChange={(e) => setPreparedBy(e.target.value)}
          className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
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
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? "Memproses…" : "Buat Surat Jalan"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-zinc-400 hover:text-zinc-600">
          Batal
        </button>
      </div>
      {error && <p className="mt-1.5 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
