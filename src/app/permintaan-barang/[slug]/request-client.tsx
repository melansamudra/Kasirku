"use client";

import { useId, useState } from "react";
import { submitPurchaseRequest } from "./actions";

type Employee = { id: string; name: string };
type MasterItem = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  department: string | null;
  barcode: string | null;
  purchaseUnits: { unitName: string; conversion: number }[];
};

const NEW_ITEM_VALUE = "__new__";

const DEPARTMENT_LABELS: Record<string, string> = {
  dapur: "🍳 Dapur",
  bar: "🍹 Bar",
  front: "🛎️ Front",
  lainnya: "Lainnya",
};

function groupItemsByDepartment(items: MasterItem[]): [string, MasterItem[]][] {
  const groups = new Map<string, MasterItem[]>();
  for (const item of items) {
    const key = item.department ?? "lainnya";
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  const order = ["dapur", "bar", "front", "lainnya"];
  return order.filter((k) => groups.has(k)).map((k) => [k, groups.get(k)!]);
}

type CartRow = {
  key: string;
  itemId: string; // MasterItem.id, or NEW_ITEM_VALUE
  newItemName: string;
  unit: string; // satuan yang lagi dipakai buat baris ini (bebas apa adanya)
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
  stockLocations,
  lockedLocation,
}: {
  slug: string;
  businessName: string;
  isFnb: boolean;
  employees: Employee[];
  items: MasterItem[];
  stockLocations: { id: string; name: string }[];
  lockedLocation?: { id: string; name: string } | null;
}) {
  const formId = useId();
  const [employeeId, setEmployeeId] = useState("");
  const [locationId, setLocationId] = useState(lockedLocation?.id ?? "");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<CartRow[]>([emptyRow(isFnb ? "" : "pcs")]);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [scanInput, setScanInput] = useState("");
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  // "Cek Order" dulu sebelum beneran kirim — staf lihat ringkasan barang +
  // qty, bisa kembali edit kalau ada yang salah, baru tekan "Ya, Kirim" buat
  // submit ke DB (arahan user 2026-08-29: sebelumnya sekali klik langsung
  // final, tidak ada tahap cek ulang).
  const [step, setStep] = useState<"form" | "review">("form");
  const [reviewItems, setReviewItems] = useState<
    {
      itemId: string | null;
      newItemName: string | null;
      unit: string | null;
      qtyOrdered: number;
      currentStock: number | null;
    }[]
    | null
  >(null);

  const itemMap = new Map(items.map((i) => [i.id, i]));
  const groupedItems = groupItemsByDepartment(items);

  // Barcode scanner bekerja seperti keyboard: ketik kode lalu Enter — sama
  // pola dengan pencarian barcode di POS & Permintaan Gudang.
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

    setScanFeedback(null);
    setScanInput("");
    const defaultUnit = match.purchaseUnits[0]?.unitName ?? match.unit;
    setRows((prev) => {
      const lastRow = prev[prev.length - 1];
      if (lastRow && !lastRow.itemId) {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...lastRow,
          itemId: match.id,
          currentStock: String(match.stock),
          unit: defaultUnit,
        };
        return updated;
      }
      return [
        ...prev,
        {
          key: crypto.randomUUID(),
          itemId: match.id,
          newItemName: "",
          unit: defaultUnit,
          qtyOrdered: "",
          currentStock: String(match.stock),
        },
      ];
    });
  }

  function updateRow(key: string, patch: Partial<CartRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function handleItemPick(key: string, itemId: string) {
    if (itemId === NEW_ITEM_VALUE) {
      updateRow(key, { itemId, currentStock: "" });
      return;
    }
    const item = itemMap.get(itemId);
    // Default ke satuan beli pertama kalau ada (lebih natural buat staf,
    // mis. "Sak"), kalau tidak ada varian ya pakai satuan stok langsung.
    const defaultUnit = item?.purchaseUnits[0]?.unitName ?? item?.unit ?? "";
    updateRow(key, {
      itemId,
      currentStock: item ? String(item.stock) : "",
      unit: defaultUnit,
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
    if (stockLocations.length > 0 && !locationId) {
      setResult({ ok: false, message: "Pilih lokasi dulu." });
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

      // Qty & satuan dikirim APA ADANYA (tidak dikonversi) — konversi ke
      // satuan stok baru terjadi nanti saat barang dicatat sebagai
      // pembelian resmi, biar order ke supplier tetap dalam satuan aslinya.
      if (r.itemId === NEW_ITEM_VALUE) {
        if (!r.newItemName.trim()) {
          setResult({ ok: false, message: "Isi nama barang baru." });
          return;
        }
        preparedItems.push({
          itemId: null,
          newItemName: r.newItemName.trim(),
          unit: r.unit.trim() || null,
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
          unit: r.unit || null,
          qtyOrdered: qty,
          currentStock,
        });
      }
    }

    setReviewItems(preparedItems);
    setStep("review");
  }

  async function handleConfirmSend() {
    if (!reviewItems) return;
    setPending(true);
    const res = await submitPurchaseRequest(slug, employeeId, note, reviewItems, locationId || null);
    setPending(false);

    if (!res.success) {
      setResult({ ok: false, message: res.error });
      return;
    }

    setResult({ ok: true, message: "Order barang terkirim! Admin akan proses ke supplier." });
    setRows([emptyRow(isFnb ? "" : "pcs")]);
    setNote("");
    setLocationId(lockedLocation?.id ?? "");
    setReviewItems(null);
    setStep("form");
  }

  function handleBackToForm() {
    setResult(null);
    setStep("form");
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

      {step === "review" ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-800">Cek dulu sebelum dikirim</p>
            <p className="mt-0.5 text-[11px] text-amber-700">
              Pastikan barang &amp; qty di bawah sudah benar. Kalau ada yang salah, tekan "Kembali" buat edit lagi.
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Nama</span>
              <span className="font-medium text-zinc-900">
                {employees.find((e) => e.id === employeeId)?.name ?? "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Lokasi</span>
              <span className="font-medium text-zinc-900">
                {lockedLocation?.name ?? stockLocations.find((l) => l.id === locationId)?.name ?? "—"}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            {(reviewItems ?? []).map((it, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                <span className="text-zinc-800">
                  {it.itemId ? (itemMap.get(it.itemId)?.name ?? "(barang)") : it.newItemName}
                  {!it.itemId && <span className="ml-1.5 text-[10px] text-zinc-400">(baru)</span>}
                </span>
                <span className="font-medium text-zinc-900">
                  {it.qtyOrdered} {it.unit}
                </span>
              </div>
            ))}
          </div>

          {note.trim() && (
            <div>
              <p className="mb-1 text-xs font-medium text-zinc-600">Catatan</p>
              <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">{note}</p>
            </div>
          )}

          {result && (
            <p
              className={`rounded-lg px-3 py-2 text-xs ${
                result.ok ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-600"
              }`}
            >
              {result.message}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleBackToForm}
              disabled={pending}
              className="flex-1 rounded-xl border border-zinc-200 py-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              ← Kembali
            </button>
            <button
              type="button"
              onClick={handleConfirmSend}
              disabled={pending}
              className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Mengirim…" : "✓ Ya, Kirim Order"}
            </button>
          </div>
        </div>
      ) : (
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

        {lockedLocation ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Lokasi</label>
            <div className="w-full rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-sm font-medium text-brand-700">
              📍 {lockedLocation.name}
            </div>
          </div>
        ) : (
          stockLocations.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Lokasi</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                <option value="">— Pilih lokasi —</option>
                {stockLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )
        )}

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

        <div className="space-y-3">
          {rows.map((row, idx) => {
            const selectedItem = itemMap.get(row.itemId);
            const unitOptions = selectedItem
              ? [selectedItem.unit, ...selectedItem.purchaseUnits.map((u) => u.unitName)]
              : [];

            return (
              <div key={row.key} className="rounded-xl border border-zinc-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-zinc-500">
                    Barang #{idx + 1}
                    {selectedItem?.department && (
                      <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                        {DEPARTMENT_LABELS[selectedItem.department]}
                      </span>
                    )}
                  </p>
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
                  {groupedItems.map(([dept, deptItems]) => (
                    <optgroup key={dept} label={DEPARTMENT_LABELS[dept]}>
                      {deptItems.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </optgroup>
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
                    <input
                      type="text"
                      placeholder="Satuan (kg, sak, pcs, ...)"
                      value={row.unit}
                      onChange={(e) => updateRow(row.key, { unit: e.target.value })}
                      className="w-32 shrink-0 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    />
                  </div>
                )}

                {unitOptions.length > 1 && (
                  <select
                    value={row.unit}
                    onChange={(e) => updateRow(row.key, { unit: e.target.value })}
                    className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  >
                    {unitOptions.map((u) => (
                      <option key={u} value={u}>
                        Satuan: {u}
                      </option>
                    ))}
                  </select>
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
                      Stok saat ini{selectedItem ? ` (${selectedItem.unit})` : ""}
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
            );
          })}
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
          className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Cek Order Dulu →
        </button>
      </form>
      )}
    </div>
  );
}
