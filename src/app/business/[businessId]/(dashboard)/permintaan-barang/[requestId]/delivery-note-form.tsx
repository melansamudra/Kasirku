"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDeliveryNote, type DeliveryNoteItemInput } from "../delivery-note-actions";

type Employee = { id: string; name: string };
type EligibleItem = {
  sourceType: "stock_fulfillment" | "grn_item";
  sourceId: string;
  itemName: string;
  unit: string;
  qty: number;
  sourceLabel: string;
};

export default function DeliveryNoteForm({
  businessId,
  requestId,
  employees,
  eligibleItems,
}: {
  businessId: string;
  requestId: string;
  employees: Employee[];
  eligibleItems: EligibleItem[];
}) {
  const router = useRouter();
  const [preparedBy, setPreparedBy] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(eligibleItems.map((it) => [it.sourceId, true])),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    if (!preparedBy) {
      setError("Pilih nama yang menyiapkan barang dulu.");
      return;
    }
    const items: DeliveryNoteItemInput[] = eligibleItems
      .filter((it) => checked[it.sourceId])
      .map((it) => ({ sourceType: it.sourceType, sourceId: it.sourceId, itemName: it.itemName, unit: it.unit, qty: it.qty }));
    if (items.length === 0) {
      setError("Pilih minimal 1 barang.");
      return;
    }
    setError(null);
    setPending(true);
    createDeliveryNote(businessId, requestId, preparedBy, items)
      .then((res) => {
        setPending(false);
        if (res.error || !res.deliveryNoteId) {
          setError(res.error ?? "Gagal membuat Surat Jalan.");
          return;
        }
        router.push(`/business/${businessId}/permintaan-barang/${requestId}/surat-jalan/${res.deliveryNoteId}`);
      })
      .catch(() => {
        setPending(false);
        setError("Gagal terhubung ke server. Cek koneksi internet lalu coba lagi.");
      });
  }

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 print:hidden">
      <p className="text-[11px] font-semibold text-amber-800">📦 Siapkan Surat Jalan</p>
      <p className="mt-0.5 text-[11px] text-amber-700">
        Centang barang yang siap dikirim SEKARANG. Boleh sebagian dulu (mis. yang dari stok Gudang) —
        sisanya bisa dibuatkan Surat Jalan menyusul begitu siap.
      </p>

      <div className="mt-3 space-y-1.5">
        {eligibleItems.map((it) => (
          <label
            key={it.sourceId}
            className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs"
          >
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checked[it.sourceId] ?? false}
                onChange={(e) => setChecked((prev) => ({ ...prev, [it.sourceId]: e.target.checked }))}
              />
              <span className="font-medium text-zinc-800">{it.itemName}</span>
              <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">{it.sourceLabel}</span>
            </span>
            <span className="text-zinc-500">
              {it.qty} {it.unit}
            </span>
          </label>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={preparedBy}
          onChange={(e) => setPreparedBy(e.target.value)}
          className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[11px] focus:border-brand-600 focus:outline-none"
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
          disabled={pending}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Menyimpan…" : "Buat & Cetak Surat Jalan"}
        </button>
      </div>
      {error && <p className="mt-1.5 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
