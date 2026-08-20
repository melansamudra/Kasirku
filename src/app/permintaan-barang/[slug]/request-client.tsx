"use client";

import { useId, useState } from "react";
import { submitPurchaseRequest } from "./actions";

type Employee = { id: string; name: string };
type MasterItem = { id: string; name: string; unit: string; stock: number };

const NEW_ITEM_VALUE = "__new__";

type CartRow = {
  key: string;
  itemId: string; // MasterItem.id, or NEW_ITEM_VALUE
  newItemName: string;
  unit: string;
  qtyOrdered: string;
  currentStock: string;
};

function emptyRow(defaultUnit: string): CartRow {
  return {
    key: crypto.randomUUID(),
    itemId: "",
    newItemName: "",
    unit: defaultUnit,
    qtyOrdered: "",
    currentStock: "",
  };
}

export default function RequestClient({
  slug,
  businessName,
  isFnb,
  employees,
  items,
}: {
  slug: string;
  businessName: string;
  isFnb: boolean;
  employees: Employee[];
  items: MasterItem[];
}) {
  const formId = useId();
  const [employeeId, setEmployeeId] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<CartRow[]>([emptyRow(isFnb ? "" : "pcs")]);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const itemMap = new Map(items.map((i) => [i.id, i]));

  function updateRow(key: string, patch: Partial<CartRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function handleItemPick(key: string, itemId: string) {
    if (itemId === NEW_ITEM_VALUE) {
      updateRow(key, { itemId, currentStock: "" });
      return;
    }
    const item = itemMap.get(itemId);
    updateRow(key, {
      itemId,
      currentStock: item ? String(item.stock) : "",
      unit: item?.unit ?? "",
    });
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(isFnb ? "" : "pcs")]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    if (!employeeId) {
      setResult({ ok: false, message: "Pilih nama dulu." });
      return;
    }

    const preparedItems: {
      itemId: string | null;
      newItemName: string | null;
      unit: string | null;
      qtyOrdered: number;
      currentStock: number | null;
    }[] = [];

    for (const r of rows) {
      const qty = Number(r.qtyOrdered);
      if (!r.qtyOrdered || Number.isNaN(qty) || qty <= 0) {
        setResult({ ok: false, message: "Isi qty order untuk setiap barang (harus lebih dari 0)." });
        return;
      }
      const currentStock = r.currentStock === "" ? null : Number(r.currentStock);
      if (r.currentStock !== "" && Number.isNaN(currentStock as number)) {
        setResult({ ok: false, message: "Stok saat ini harus angka." });
        return;
      }

      if (r.itemId === NEW_ITEM_VALUE) {
        if (!r.newItemName.trim()) {
          setResult({ ok: false, message: "Isi nama barang baru." });
          return;
        }
        preparedItems.push({
          itemId: null,
          newItemName: r.newItemName.trim(),
          unit: isFnb ? r.unit.trim() || null : null,
          qtyOrdered: qty,
          currentStock,
        });
      } else {
        if (!r.itemId) {
          setResult({ ok: false, message: "Pilih barang untuk setiap baris." });
          return;
        }
        preparedItems.push({
          itemId: r.itemId,
          newItemName: null,
          unit: null,
          qtyOrdered: qty,
          currentStock,
        });
      }
    }

    setPending(true);
    const res = await submitPurchaseRequest(slug, employeeId, note, preparedItems);
    setPending(false);

    if (!res.success) {
      setResult({ ok: false, message: res.error });
      return;
    }

    setResult({ ok: true, message: "Order barang terkirim! Admin akan proses ke supplier." });
    setRows([emptyRow(isFnb ? "" : "pcs")]);
    setNote("");
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {businessName}
      </p>
      <h1 className="mt-1 text-center text-lg font-bold text-zinc-900">Order Barang</h1>
      <p className="mt-1 text-center text-[11px] text-zinc-400">
        Isi barang yang mau diorder, qty, dan stok yang kamu lihat sekarang.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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

        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div key={row.key} className="rounded-xl border border-zinc-200 p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-zinc-500">Barang #{idx + 1}</p>
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
                onChange={(e) => handleItemPick(row.key, e.target.value)}
                className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                <option value="">— Pilih barang —</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
                <option value={NEW_ITEM_VALUE}>+ Barang baru (belum ada di daftar)</option>
              </select>

              {row.itemId === NEW_ITEM_VALUE && (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    placeholder="Nama barang baru"
                    value={row.newItemName}
                    onChange={(e) => updateRow(row.key, { newItemName: e.target.value })}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                  {isFnb && (
                    <input
                      type="text"
                      placeholder="Satuan (kg, pcs, ...)"
                      value={row.unit}
                      onChange={(e) => updateRow(row.key, { unit: e.target.value })}
                      className="w-28 shrink-0 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    />
                  )}
                </div>
              )}

              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor={`${formId}-qty-${row.key}`}
                    className="mb-1 block text-[11px] text-zinc-500"
                  >
                    Qty order{row.unit ? ` (${row.unit})` : ""}
                  </label>
                  <input
                    id={`${formId}-qty-${row.key}`}
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={row.qtyOrdered}
                    onChange={(e) => updateRow(row.key, { qtyOrdered: e.target.value })}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${formId}-stock-${row.key}`}
                    className="mb-1 block text-[11px] text-zinc-500"
                  >
                    Stok saat ini
                  </label>
                  <input
                    id={`${formId}-stock-${row.key}`}
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={row.currentStock}
                    onChange={(e) => updateRow(row.key, { currentStock: e.target.value })}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="w-full rounded-xl border border-dashed border-zinc-300 py-2.5 text-xs font-medium text-zinc-500 hover:border-brand-300 hover:text-brand-700"
        >
          + Tambah barang lain
        </button>

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
          {pending ? "Mengirim…" : "Kirim Order"}
        </button>
      </form>
    </div>
  );
}
