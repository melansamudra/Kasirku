"use client";

import { useId, useState } from "react";
import { submitProductionScan } from "./actions";

type Employee = { id: string; name: string };
type MasterItem = { id: string; name: string; unit: string; stock: number; barcode: string | null };

export default function RequestClient({
  slug,
  businessName,
  employees,
  items,
}: {
  slug: string;
  businessName: string;
  employees: Employee[];
  items: MasterItem[];
}) {
  const formId = useId();
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [scanInput, setScanInput] = useState("");
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);

  const selectedItem = items.find((i) => i.id === itemId);

  // Barcode scanner bekerja seperti keyboard: ketik kode lalu Enter — sama
  // pola dengan scan di Permintaan Gudang & Permintaan Resto.
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
    setItemId(match.id);
  }

  function resetForm() {
    setItemId("");
    setQty("");
    setNote("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    const qtyNum = Number(qty);
    if (!itemId) {
      setResult({ ok: false, message: "Scan atau pilih bahan yang diproduksi dulu." });
      return;
    }
    if (!qty || Number.isNaN(qtyNum) || qtyNum <= 0) {
      setResult({ ok: false, message: "Isi jumlah yang diproduksi (harus lebih dari 0)." });
      return;
    }

    setPending(true);
    const res = await submitProductionScan(slug, itemId, qtyNum, employeeId, note);
    setPending(false);

    if (!res.success) {
      setResult({ ok: false, message: res.error });
      return;
    }

    setResult({ ok: true, message: "Tersimpan sebagai draft! Menunggu diverifikasi supervisor." });
    resetForm();
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">{businessName}</p>
      <h1 className="mt-1 text-center text-lg font-bold text-zinc-900">Catat Produksi (Scan)</h1>
      <p className="mt-1 text-center text-[11px] text-zinc-400">
        Scan barcode bahan setengah jadi yang baru selesai dibuat, isi jumlahnya. Tidak langsung
        mengubah stok — supervisor akan verifikasi dulu.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Scan Barcode</label>
          <input
            type="text"
            value={scanInput}
            onChange={(e) => {
              setScanInput(e.target.value);
              setScanFeedback(null);
            }}
            onKeyDown={handleScanKeyDown}
            placeholder="Arahkan scanner ke sini lalu scan…"
            autoFocus
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {scanFeedback && <p className="mt-1 text-[11px] text-red-600">{scanFeedback}</p>}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Atau pilih manual</label>
          <select
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">— Pilih bahan setengah jadi —</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>

        {selectedItem && (
          <div className="rounded-xl bg-brand-50 px-3.5 py-2.5 text-sm font-medium text-brand-700">
            {selectedItem.name}
          </div>
        )}

        <div>
          <label htmlFor={`${formId}-qty`} className="mb-1 block text-xs font-medium text-zinc-600">
            Jumlah Diproduksi{selectedItem ? ` (${selectedItem.unit})` : ""}
          </label>
          <input
            id={`${formId}-qty`}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Nama Anda (opsional)</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">—</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Catatan (opsional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="mis. batch pagi"
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
          {pending ? "Mengirim…" : "Kirim ke Supervisor"}
        </button>
      </form>
    </div>
  );
}
