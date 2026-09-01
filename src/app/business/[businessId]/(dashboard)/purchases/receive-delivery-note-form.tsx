"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchDeliveryNoteByCode,
  receiveDeliveryNote,
  type DeliveryNoteItem,
} from "./receive-delivery-note-actions";

type FetchedNote = {
  dnNumber: string;
  fromBusinessName: string;
  destination: string;
  createdAt: string;
  alreadyReceived: boolean;
  receivedByBusinessName: string | null;
  items: DeliveryNoteItem[];
};

type ItemDraft = { ingredientId: string; unitPrice: string };

export default function ReceiveDeliveryNoteForm({
  businessId,
  ingredients,
}: {
  businessId: string;
  ingredients: { id: string; name: string; unit: string }[];
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [note, setNote] = useState<FetchedNote | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [drafts, setDrafts] = useState<ItemDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function bestMatch(itemName: string): string {
    const found = ingredients.find((i) => i.name.trim().toLowerCase() === itemName.trim().toLowerCase());
    return found?.id ?? "";
  }

  async function handleFetch() {
    setFetching(true);
    setFetchError(null);
    setNote(null);
    const result = await fetchDeliveryNoteByCode(code);
    setFetching(false);
    if (result.error || !result.data) {
      setFetchError(result.error ?? "Gagal mengambil data.");
      return;
    }
    setNote(result.data);
    setSupplierName(result.data.fromBusinessName);
    setDrafts(result.data.items.map((it) => ({ ingredientId: bestMatch(it.name), unitPrice: "" })));
  }

  async function handleSubmit() {
    if (!note) return;
    setSubmitting(true);
    setSubmitError(null);

    const items = note.items.map((it, idx) => ({
      itemName: it.name,
      unit: it.unit ?? "pcs",
      qty: Number(it.qty),
      ingredientId: drafts[idx]?.ingredientId || null,
      unitPrice: Number(drafts[idx]?.unitPrice) || 0,
    }));

    const result = await receiveDeliveryNote(businessId, code, supplierName, items);
    setSubmitting(false);
    if (result.error && !result.success) {
      setSubmitError(result.error);
      return;
    }
    if (result.error && result.success) {
      setSubmitError(`Sebagian tercatat, sebagian gagal: ${result.error}`);
    }
    setCode("");
    setNote(null);
    setDrafts([]);
    router.refresh();
  }

  return (
    <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Terima dari Surat Jalan</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Masukkan Kode Terima dari Surat Jalan yang dicetak pengirim (mis. Llauk Nusantara) — daftar
        barangnya otomatis terisi, tinggal cocokkan bahan &amp; isi harga.
      </p>

      {!note && (
        <div className="mt-4 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="mis. a1b2c3d4e5"
            className="flex-1 rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm font-mono focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <button
            onClick={handleFetch}
            disabled={fetching || !code.trim()}
            className="shrink-0 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {fetching ? "Mencari…" : "Cari"}
          </button>
        </div>
      )}

      {fetchError && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{fetchError}</p>
      )}

      {note && note.alreadyReceived && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Surat Jalan {note.dnNumber} dari {note.fromBusinessName} sudah pernah diterima oleh{" "}
          {note.receivedByBusinessName ?? "toko lain"}.
          <button
            onClick={() => {
              setNote(null);
              setCode("");
            }}
            className="ml-2 font-medium text-brand-700 hover:underline"
          >
            Cari kode lain
          </button>
        </div>
      )}

      {note && !note.alreadyReceived && (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg bg-zinc-50 px-3 py-2.5 text-xs text-zinc-600">
            <p>
              <span className="font-semibold text-zinc-900">{note.dnNumber}</span> dari{" "}
              <span className="font-semibold text-zinc-900">{note.fromBusinessName}</span>
            </p>
            <p className="mt-0.5 text-zinc-400">Tujuan: {note.destination}</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Nama Supplier (dicatat di Pembelian)</label>
            <input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div className="space-y-2">
            {note.items.map((item, idx) => (
              <div key={idx} className="rounded-xl border border-zinc-200 px-3.5 py-3">
                <p className="text-sm font-medium text-zinc-900">
                  {item.name} — {Number(item.qty)} {item.unit ?? ""}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-zinc-500">Cocokkan Bahan Baku</label>
                    <select
                      value={drafts[idx]?.ingredientId ?? ""}
                      onChange={(e) =>
                        setDrafts((prev) =>
                          prev.map((d, i) => (i === idx ? { ...d, ingredientId: e.target.value } : d)),
                        )
                      }
                      className="w-full rounded-lg border border-zinc-200 px-2.5 py-2 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                    >
                      <option value="">— Buat bahan baru —</option>
                      {ingredients.map((ing) => (
                        <option key={ing.id} value={ing.id}>
                          {ing.name} ({ing.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-zinc-500">Harga Satuan</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={drafts[idx]?.unitPrice ?? ""}
                      onChange={(e) =>
                        setDrafts((prev) =>
                          prev.map((d, i) => (i === idx ? { ...d, unitPrice: e.target.value } : d)),
                        )
                      }
                      className="w-full rounded-lg border border-zinc-200 px-2.5 py-2 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                      placeholder="mis. 12000"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {submitError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{submitError}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Menyimpan…" : "Terima & Catat Pembelian"}
            </button>
            <button
              onClick={() => {
                setNote(null);
                setCode("");
              }}
              className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
            >
              Batal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
