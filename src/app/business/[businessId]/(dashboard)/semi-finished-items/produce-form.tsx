"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { produceSemiFinishedItem } from "./actions";

type LocationOption = { id: string; name: string };

export default function ProduceForm({
  businessId,
  itemId,
  itemUnit,
  locations,
}: {
  businessId: string;
  itemId: string;
  itemUnit: string;
  locations: LocationOption[];
}) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    if (!locationId) {
      setError("Pilih lokasi dulu.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const result = await produceSemiFinishedItem(businessId, itemId, locationId, Number(qty));
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setQty("");
    setSuccess(true);
    router.refresh();
  }

  if (locations.length === 0) {
    return (
      <p className="mt-2 rounded-xl border border-dashed border-zinc-200 px-4 py-4 text-center text-xs text-zinc-400">
        Belum ada lokasi untuk produksi.
      </p>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Lokasi</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Jumlah diproduksi ({itemUnit})</label>
          <input
            type="number"
            min="0"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={handleSubmit}
            disabled={submitting || !qty}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {submitting ? "Memproses…" : "Produksi"}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-600">{error}</p>}
      {success && (
        <p className="mt-2 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs text-brand-700">
          Produksi berhasil dicatat — bahan mentah otomatis berkurang, stok bertambah.
        </p>
      )}
    </div>
  );
}
