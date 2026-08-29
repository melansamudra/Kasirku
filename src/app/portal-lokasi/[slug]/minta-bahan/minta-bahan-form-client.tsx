"use client";

import { useMemo, useState } from "react";
import { submitMintaBahanPortal } from "./actions";

type ItemOption = { id: string; name: string; unit: string };

// Module scope (bukan di dalam komponen) -- kalau di dalam, React anggap
// komponen baru tiap parent re-render, input kehilangan fokus tiap keystroke
// (pola sama seperti transfer-internal/[slug]/transfer-client.tsx).
function ItemRow({
  item,
  value,
  onChange,
}: {
  item: ItemOption;
  value: string;
  onChange: (id: string, value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-zinc-100 py-2 last:border-0">
      <p className="min-w-0 flex-1 truncate text-sm text-zinc-800">{item.name}</p>
      <input
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        placeholder={item.unit}
        value={value}
        onChange={(e) => onChange(item.id, e.target.value)}
        className="w-24 shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-right text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
    </div>
  );
}

export default function MintaBahanFormClient({
  locationTransferSlug,
  businessId,
  locationId,
  semiFinishedItems,
}: {
  locationTransferSlug: string;
  businessId: string;
  locationId: string;
  semiFinishedItems: ItemOption[];
}) {
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const filledCount = useMemo(
    () => Object.values(values).filter((v) => v.trim() !== "").length,
    [values],
  );

  function handleChange(id: string, value: string) {
    setValues((prev) => ({ ...prev, [id]: value }));
  }

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return semiFinishedItems;
    return semiFinishedItems.filter((i) => i.name.toLowerCase().includes(q));
  }, [query, semiFinishedItems]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    const items = semiFinishedItems
      .filter((i) => values[i.id]?.trim())
      .map((i) => ({ id: i.id, qty: Number(values[i.id]) }));

    if (items.some((i) => Number.isNaN(i.qty) || i.qty <= 0)) {
      setResult({ ok: false, message: "Qty harus angka lebih dari 0." });
      return;
    }
    if (items.length === 0) {
      setResult({ ok: false, message: "Isi minimal 1 bahan dulu." });
      return;
    }

    setPending(true);
    const res = await submitMintaBahanPortal(locationTransferSlug, businessId, locationId, note, items);
    setPending(false);

    if (!res.success) {
      setResult({ ok: false, message: res.error });
      return;
    }

    setResult({ ok: true, message: "Permintaan terkirim! Dapur Produksi akan proses & kirim." });
    setValues({});
    setNote("");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600">Cari Bahan (opsional)</label>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ketik nama bahan…"
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {visibleItems.length > 0 ? (
        <div className="max-h-80 overflow-y-auto rounded-xl border border-zinc-200 px-3">
          {visibleItems.map((i) => (
            <ItemRow key={i.id} item={i} value={values[i.id] ?? ""} onChange={handleChange} />
          ))}
        </div>
      ) : (
        <p className="text-center text-xs text-zinc-400">Tidak ada bahan yang cocok.</p>
      )}

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
        {pending ? "Mengirim…" : `Kirim Permintaan${filledCount > 0 ? ` (${filledCount} bahan)` : ""}`}
      </button>
    </form>
  );
}
