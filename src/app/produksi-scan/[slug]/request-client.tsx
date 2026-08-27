"use client";

import { useId, useMemo, useState } from "react";
import { submitProductionScan } from "./actions";

type Employee = { id: string; name: string };
type RecipeLine = { name: string; qtyPerUnit: number; unit: string; availableStock: number };
type MasterItem = { id: string; name: string; unit: string; stock: number; recipe: RecipeLine[] };

function formatQty(value: number) {
  return Number(value.toFixed(4)).toLocaleString("id-ID");
}

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
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [itemId, setItemId] = useState("");
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [qty, setQty] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const selectedItem = items.find((i) => i.id === itemId);
  const qtyNum = Number(qty) || 0;
  const preview = useMemo(
    () => (selectedItem?.recipe ?? []).map((line) => ({ ...line, needed: line.qtyPerUnit * qtyNum })),
    [selectedItem, qtyNum],
  );

  function resetForm() {
    setItemId("");
    setNewName("");
    setNewUnit("");
    setQty("");
    setNote("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    if (mode === "existing" && !itemId) {
      setResult({ ok: false, message: "Pilih bahan yang diproduksi dulu." });
      return;
    }
    if (mode === "new" && (!newName.trim() || !newUnit.trim())) {
      setResult({ ok: false, message: "Isi nama dan satuan bahan barunya." });
      return;
    }
    if (!qty || Number.isNaN(qtyNum) || qtyNum <= 0) {
      setResult({ ok: false, message: "Isi jumlah yang diproduksi (harus lebih dari 0)." });
      return;
    }

    setPending(true);
    const res = await submitProductionScan(
      slug,
      mode === "existing" ? { itemId } : { newName, newUnit },
      qtyNum,
      employeeId,
      note,
    );
    setPending(false);

    if (!res.success) {
      setResult({ ok: false, message: res.error });
      return;
    }

    setResult({
      ok: true,
      message:
        mode === "new"
          ? "Tersimpan! Supervisor akan tentukan bahan ini digabung ke item lama atau dibuat baru."
          : "Tersimpan sebagai draft! Menunggu diverifikasi supervisor.",
    });
    resetForm();
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">{businessName}</p>
      <h1 className="mt-1 text-center text-lg font-bold text-zinc-900">Catat Produksi</h1>
      <p className="mt-1 text-center text-[11px] text-zinc-400">
        Pilih bahan setengah jadi yang baru selesai dibuat, isi jumlahnya. Tidak langsung mengubah
        stok — supervisor akan verifikasi dulu.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div className="flex rounded-xl border border-zinc-200 p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={`flex-1 rounded-lg py-2 transition-colors ${
              mode === "existing" ? "bg-brand-600 text-white" : "text-zinc-500"
            }`}
          >
            Pilih dari daftar
          </button>
          <button
            type="button"
            onClick={() => setMode("new")}
            className={`flex-1 rounded-lg py-2 transition-colors ${
              mode === "new" ? "bg-brand-600 text-white" : "text-zinc-500"
            }`}
          >
            Bahan baru
          </button>
        </div>

        {mode === "existing" ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Bahan Setengah Jadi</label>
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
        ) : (
          <div className="space-y-3 rounded-xl border border-dashed border-zinc-300 p-3">
            <p className="text-[11px] text-zinc-500">
              Belum ada di daftar? Ketik nama bahannya — supervisor yang akan putuskan nanti digabung
              ke item lama atau dibuat item baru.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Nama Bahan</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="mis. Sambal Matah"
                className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Satuan</label>
              <input
                type="text"
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                placeholder="porsi / gr / ml / pcs"
                className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>
        )}

        <div>
          <label htmlFor={`${formId}-qty`} className="mb-1 block text-xs font-medium text-zinc-600">
            Jumlah Diproduksi
            {mode === "existing" && selectedItem ? ` (${selectedItem.unit})` : mode === "new" && newUnit ? ` (${newUnit})` : ""}
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

        {mode === "existing" && selectedItem && (
          <div className="rounded-xl bg-zinc-50 p-3">
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">
              Bahan yang akan terpakai
            </p>
            {preview.length === 0 ? (
              <p className="text-xs text-zinc-400">Item ini belum punya resep.</p>
            ) : (
              <div className="space-y-1">
                {preview.map((line) => {
                  const insufficient = qtyNum > 0 && line.needed > line.availableStock + 1e-9;
                  return (
                    <div key={line.name} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-zinc-600">{line.name}</span>
                      <span className={insufficient ? "font-semibold text-red-600" : "text-zinc-700"}>
                        {formatQty(line.needed)} {line.unit}
                        <span className="text-zinc-400"> / stok {formatQty(line.availableStock)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

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
