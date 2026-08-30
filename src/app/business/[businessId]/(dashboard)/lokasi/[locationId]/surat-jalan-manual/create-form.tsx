"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createManualDeliveryNote } from "./actions";

type Row = { itemName: string; unit: string; qty: string };

function emptyRow(): Row {
  return { itemName: "", unit: "", qty: "" };
}

export default function CreateManualDnForm({ businessId, locationId }: { businessId: string; locationId: string }) {
  const router = useRouter();
  const [destination, setDestination] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSubmit() {
    setError(null);
    setPending(true);
    createManualDeliveryNote(
      businessId,
      locationId,
      destination,
      note,
      rows.map((r) => ({ itemName: r.itemName, unit: r.unit, qty: Number(r.qty) })),
    )
      .then((res) => {
        setPending(false);
        if (res.error) {
          setError(res.error);
          return;
        }
        setDestination("");
        setNote("");
        setRows([emptyRow()]);
        router.refresh();
      })
      .catch(() => {
        setPending(false);
        setError("Gagal terhubung ke server. Cek koneksi internet lalu coba lagi.");
      });
  }

  return (
    <div className="rounded-xl bg-white shadow-sm p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Buat Surat Jalan Baru</h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        Isi bebas — tidak terhubung ke Permintaan Barang/PO manapun. Murni dokumen pengiriman.
      </p>

      <div className="mt-3 space-y-3">
        <div>
          <label className="text-xs font-medium text-zinc-600">Tujuan Pengiriman</label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="mis. Kitchen Atas / Nama toko / Alamat"
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-zinc-600">Daftar Barang</label>
          <div className="mt-1 space-y-2">
            {rows.map((row, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={row.itemName}
                  onChange={(e) => updateRow(idx, { itemName: e.target.value })}
                  placeholder="Nama barang"
                  className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[13px] focus:border-brand-600 focus:outline-none"
                />
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={row.qty}
                  onChange={(e) => updateRow(idx, { qty: e.target.value })}
                  placeholder="Qty"
                  className="w-20 rounded-lg border border-zinc-200 px-2 py-1.5 text-right text-[13px] focus:border-brand-600 focus:outline-none"
                />
                <input
                  type="text"
                  value={row.unit}
                  onChange={(e) => updateRow(idx, { unit: e.target.value })}
                  placeholder="Satuan"
                  className="w-20 rounded-lg border border-zinc-200 px-2 py-1.5 text-[13px] focus:border-brand-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  disabled={rows.length === 1}
                  className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-zinc-400 hover:text-red-600 disabled:opacity-30"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addRow}
            className="mt-2 text-xs font-medium text-brand-600 hover:underline"
          >
            + Tambah Barang
          </button>
        </div>

        <div>
          <label className="text-xs font-medium text-zinc-600">Catatan (opsional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={pending}
          className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Menyimpan…" : "Simpan & Buat Surat Jalan"}
        </button>
      </div>
    </div>
  );
}
