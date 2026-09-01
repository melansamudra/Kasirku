"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { transferIngredientStock } from "./actions";

type LocationOption = { id: string; name: string };
type IngredientOption = { id: string; name: string; unit: string };

export default function SimpleTransferForm({
  businessId,
  locationId,
  otherLocations,
  ingredients,
}: {
  businessId: string;
  locationId: string;
  otherLocations: LocationOption[];
  ingredients: IngredientOption[];
}) {
  const router = useRouter();
  const [toLocationId, setToLocationId] = useState(otherLocations[0]?.id ?? "");
  const [ingredientId, setIngredientId] = useState(ingredients[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    if (!toLocationId || !ingredientId) {
      setError("Pilih lokasi tujuan dan bahan dulu.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const result = await transferIngredientStock(businessId, locationId, toLocationId, ingredientId, Number(qty), note);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setQty("");
    setNote("");
    setSuccess(true);
    router.refresh();
  }

  if (otherLocations.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
        Belum ada lokasi lain untuk dituju.
      </p>
    );
  }

  return (
    <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Kirim Transfer</h2>
      <div className="mt-3 space-y-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Ke lokasi</label>
          <select
            value={toLocationId}
            onChange={(e) => setToLocationId(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {otherLocations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Bahan</label>
          <select
            value={ingredientId}
            onChange={(e) => setIngredientId(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.unit})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Jumlah</label>
          <input
            type="number"
            min="0"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Catatan (opsional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

        {error && <p className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-600">{error}</p>}
        {success && <p className="rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs text-brand-700">Transfer berhasil dikirim.</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || !qty}
          className="w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Mengirim…" : "Kirim Transfer"}
        </button>
      </div>
    </div>
  );
}
