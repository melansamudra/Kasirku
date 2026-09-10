"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { transferIngredientStock } from "./actions";

type Location = { id: string; name: string };
type StockItem = { ingredientId: string; name: string; unit: string; stock: number };

export default function TransferForm({
  businessId,
  locations,
  stockByLocation,
}: {
  businessId: string;
  locations: Location[];
  stockByLocation: Record<string, StockItem[]>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fromLocationId, setFromLocationId] = useState(locations[0]?.id ?? "");
  const otherLocations = useMemo(
    () => locations.filter((l) => l.id !== fromLocationId),
    [locations, fromLocationId],
  );
  const [toLocationId, setToLocationId] = useState(otherLocations[0]?.id ?? "");
  const [selected, setSelected] = useState<Record<string, string>>({}); // ingredientId -> qty string
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(() => stockByLocation[fromLocationId] ?? [], [stockByLocation, fromLocationId]);

  function handleFromChange(id: string) {
    setFromLocationId(id);
    setSelected({});
    const remaining = locations.filter((l) => l.id !== id);
    if (!remaining.some((l) => l.id === toLocationId)) {
      setToLocationId(remaining[0]?.id ?? "");
    }
  }

  function toggleItem(ingredientId: string, currentStock: number) {
    setSelected((prev) => {
      const next = { ...prev };
      if (ingredientId in next) {
        delete next[ingredientId];
      } else {
        next[ingredientId] = String(currentStock);
      }
      return next;
    });
  }

  const selectedCount = Object.keys(selected).length;

  const invalidQty = useMemo(() => {
    return Object.entries(selected).some(([id, qtyStr]) => {
      const qty = Number(qtyStr);
      const item = items.find((i) => i.ingredientId === id);
      return !qtyStr || Number.isNaN(qty) || qty <= 0 || (item && qty > item.stock);
    });
  }, [selected, items]);

  async function handleSubmit() {
    setError(null);
    if (!fromLocationId || !toLocationId) {
      setError("Lokasi asal/tujuan belum lengkap.");
      return;
    }
    if (selectedCount === 0) {
      setError("Pilih minimal satu bahan.");
      return;
    }
    if (invalidQty) {
      setError("Ada jumlah yang tidak valid (kosong, 0, atau melebihi stok tersedia).");
      return;
    }

    setPending(true);
    const result = await transferIngredientStock(
      businessId,
      fromLocationId,
      toLocationId,
      Object.entries(selected).map(([ingredientId, qty]) => ({ ingredientId, qty: Number(qty) })),
      note || null,
    );
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSelected({});
    setNote("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
      >
        + Transfer Bahan Baku
      </button>
    );
  }

  if (locations.length < 2) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
        Butuh minimal 2 lokasi untuk transfer antar-lokasi.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-xl bg-white shadow-sm p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Transfer Bahan Baku</h2>
        <button onClick={() => setOpen(false)} className="text-xs text-zinc-400 hover:text-zinc-600">
          Tutup
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Dari Lokasi</label>
          <select
            value={fromLocationId}
            onChange={(e) => handleFromChange(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Ke Lokasi</label>
          <select
            value={toLocationId}
            onChange={(e) => setToLocationId(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            {otherLocations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Pilih Bahan &amp; Jumlah</label>
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-center text-xs text-zinc-400">
            Tidak ada stok di lokasi ini.
          </p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-zinc-100 p-1.5">
            {items.map((item) => {
              const isSelected = item.ingredientId in selected;
              return (
                <div
                  key={item.ingredientId}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-zinc-50"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleItem(item.ingredientId, item.stock)}
                    className="h-4 w-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="flex-1 truncate text-zinc-700">
                    {item.name} <span className="text-zinc-400">(stok {item.stock} {item.unit})</span>
                  </span>
                  {isSelected && (
                    <input
                      type="number"
                      min="0"
                      max={item.stock}
                      step="any"
                      value={selected[item.ingredientId]}
                      onChange={(e) =>
                        setSelected((prev) => ({ ...prev, [item.ingredientId]: e.target.value }))
                      }
                      className="w-20 rounded-lg border border-zinc-200 px-2 py-1 text-right text-xs focus:border-brand-600 focus:outline-none"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Catatan (opsional)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Memindahkan…" : `Transfer${selectedCount > 0 ? ` (${selectedCount} bahan)` : ""}`}
      </button>
    </div>
  );
}
