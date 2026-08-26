"use client";

import { useId, useState } from "react";
import { submitWarehouseRequest } from "./actions";

type Warehouse = { id: string; name: string };
type Employee = { id: string; name: string };
type MasterItem = { id: string; name: string; unit: string; warehouseId: string; barcode: string | null };

type CartRow = { key: string; itemId: string; qtyRequested: string };

function emptyRow(): CartRow {
  return { key: crypto.randomUUID(), itemId: "", qtyRequested: "" };
}

export default function RequestClient({
  slug,
  businessName,
  warehouses,
  employees,
  items,
}: {
  slug: string;
  businessName: string;
  warehouses: Warehouse[];
  employees: Employee[];
  items: MasterItem[];
}) {
  const formId = useId();
  const [warehouseId, setWarehouseId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<CartRow[]>([emptyRow()]);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [scanInput, setScanInput] = useState("");
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);

  const itemsForWarehouse = items.filter((i) => i.warehouseId === warehouseId);

  // Barcode scanner bekerja seperti keyboard: ketik kode lalu Enter. Cocokkan
  // ke katalog, otomatis pilih gudang dari bahan itu kalau belum dipilih, dan
  // tambahkan sebagai baris baru — sama pola dengan pencarian barcode di POS.
  function handleScanKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const code = scanInput.trim();
    if (!code) return;

    const match = items.find((i) => i.barcode === code);
    if (!match) {
      setScanFeedback(`Barcode "${code}" tidak ditemukan.`);
      setScanInput("");
      return;
    }

    if (!warehouseId) {
      setWarehouseId(match.warehouseId);
    } else if (warehouseId !== match.warehouseId) {
      setScanFeedback(`${match.name} terdaftar di gudang lain, bukan gudang yang sedang dipilih.`);
      setScanInput("");
      return;
    }

    setScanFeedback(null);
    setScanInput("");
    setRows((prev) => {
      const lastRow = prev[prev.length - 1];
      if (lastRow && !lastRow.itemId) {
        const updated = [...prev];
        updated[updated.length - 1] = { ...lastRow, itemId: match.id };
        return updated;
      }
      return [...prev, { key: crypto.randomUUID(), itemId: match.id, qtyRequested: "" }];
    });
  }

  function updateRow(key: string, patch: Partial<CartRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    if (!warehouseId) {
      setResult({ ok: false, message: "Pilih gudang dulu." });
      return;
    }
    if (!employeeId) {
      setResult({ ok: false, message: "Pilih nama dulu." });
      return;
    }

    const preparedItems: { itemId: string; qtyRequested: number }[] = [];
    for (const r of rows) {
      if (!r.itemId) {
        setResult({ ok: false, message: "Pilih bahan untuk setiap baris." });
        return;
      }
      const qty = Number(r.qtyRequested);
      if (!r.qtyRequested || Number.isNaN(qty) || qty <= 0) {
        setResult({ ok: false, message: "Isi jumlah untuk setiap bahan (harus lebih dari 0)." });
        return;
      }
      preparedItems.push({ itemId: r.itemId, qtyRequested: qty });
    }

    setPending(true);
    const res = await submitWarehouseRequest(slug, warehouseId, employeeId, note, preparedItems);
    setPending(false);

    if (!res.success) {
      setResult({ ok: false, message: res.error });
      return;
    }

    setResult({ ok: true, message: "Permintaan terkirim! Purchasing akan segera menyiapkan." });
    setRows([emptyRow()]);
    setNote("");
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">{businessName}</p>
      <h1 className="mt-1 text-center text-lg font-bold text-zinc-900">Permintaan Bahan ke Purchasing</h1>
      <p className="mt-1 text-center text-[11px] text-zinc-400">
        Pilih gudang, nama, dan bahan baku yang dibutuhkan.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Gudang</label>
          <select
            value={warehouseId}
            onChange={(e) => {
              setWarehouseId(e.target.value);
              setRows([emptyRow()]);
            }}
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">— Pilih gudang —</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Nama Anda</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">— Pilih nama —</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Scan Barcode (opsional)</label>
          <input
            type="text"
            value={scanInput}
            onChange={(e) => {
              setScanInput(e.target.value);
              setScanFeedback(null);
            }}
            onKeyDown={handleScanKeyDown}
            placeholder="Arahkan scanner ke sini lalu scan…"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {scanFeedback && <p className="mt-1 text-[11px] text-red-600">{scanFeedback}</p>}
        </div>

        {warehouseId && (
          <div className="space-y-3">
            {rows.map((row, idx) => {
              const selectedItem = itemsForWarehouse.find((i) => i.id === row.itemId);
              return (
                <div key={row.key} className="rounded-xl border border-zinc-200 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-zinc-500">Bahan #{idx + 1}</p>
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        className="text-[11px] text-zinc-400 hover:text-red-600"
                      >
                        Hapus
                      </button>
                    )}
                  </div>

                  <select
                    value={row.itemId}
                    onChange={(e) => updateRow(row.key, { itemId: e.target.value })}
                    className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  >
                    <option value="">— Pilih bahan —</option>
                    {itemsForWarehouse.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>

                  <div className="mt-2">
                    <label
                      htmlFor={`${formId}-qty-${row.key}`}
                      className="mb-1 block text-[11px] text-zinc-500"
                    >
                      Jumlah{selectedItem ? ` (${selectedItem.unit})` : ""}
                    </label>
                    <input
                      id={`${formId}-qty-${row.key}`}
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={row.qtyRequested}
                      onChange={(e) => updateRow(row.key, { qtyRequested: e.target.value })}
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    />
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={addRow}
              className="w-full rounded-xl border border-dashed border-zinc-300 py-2.5 text-xs font-medium text-zinc-500 hover:border-brand-300 hover:text-brand-700"
            >
              + Tambah bahan lain
            </button>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Catatan (opsional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

        {result && (
          <p
            className={`rounded-lg px-3 py-2 text-xs ${
              result.ok ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-600"
            }`}
          >
            {result.message}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Mengirim…" : "Kirim Permintaan"}
        </button>
      </form>
    </div>
  );
}
