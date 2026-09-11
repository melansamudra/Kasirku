"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "./actions";

type ItemRow = { name: string; unit: string; qty: string };

export default function RequestForm({
  warehouseItemNames,
  employees,
  action,
}: {
  warehouseItemNames: string[];
  employees: { id: string; name: string }[];
  action: (requestedByName: string, note: string, items: { name: string; unit: string; qty: number }[]) => Promise<ActionState>;
}) {
  const router = useRouter();
  const [requestedBy, setRequestedBy] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<ItemRow[]>([{ name: "", unit: "", qty: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateRow(idx: number, patch: Partial<ItemRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function handleSubmit() {
    setError(null);
    if (!requestedBy) {
      setError("Pilih nama pemohon dulu.");
      return;
    }
    const items = rows
      .filter((r) => r.name.trim() && Number(r.qty) > 0)
      .map((r) => ({ name: r.name.trim(), unit: r.unit.trim(), qty: Number(r.qty) }));
    if (items.length === 0) {
      setError("Isi minimal satu barang dengan qty > 0.");
      return;
    }
    setSubmitting(true);
    const result = await action(requestedBy, note, items);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setRows([{ name: "", unit: "", qty: "" }]);
    setNote("");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-sm font-semibold text-zinc-900">Ajukan Permintaan ke Gudang</p>

      <datalist id="warehouse-item-names">
        {warehouseItemNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <div className="mt-3 space-y-2">
        {rows.map((row, idx) => (
          <div key={idx} className="flex flex-wrap gap-1.5">
            <input
              type="text"
              list="warehouse-item-names"
              placeholder="Nama barang"
              value={row.name}
              onChange={(e) => updateRow(idx, { name: e.target.value })}
              className="min-w-[160px] flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <input
              type="text"
              placeholder="Satuan"
              value={row.unit}
              onChange={(e) => updateRow(idx, { unit: e.target.value })}
              className="w-20 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
            <input
              type="number"
              min="0"
              step="any"
              placeholder="Qty"
              value={row.qty}
              onChange={(e) => updateRow(idx, { qty: e.target.value })}
              className="w-20 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
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
          onClick={() => setRows((prev) => [...prev, { name: "", unit: "", qty: "" }])}
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          + Tambah baris
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <select
          value={requestedBy}
          onChange={(e) => setRequestedBy(e.target.value)}
          className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
        >
          <option value="">— Diajukan oleh —</option>
          {employees.map((e) => (
            <option key={e.id} value={e.name}>
              {e.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Catatan (opsional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-w-[160px] flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Mengirim…" : "Ajukan Permintaan"}
      </button>
    </div>
  );
}
