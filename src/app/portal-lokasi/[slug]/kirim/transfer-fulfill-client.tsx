"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fulfillTransferPortal } from "./actions";

type Item = { id: string; item_name: string; unit: string; qty_requested: number };

export default function TransferFulfillClient({
  slug,
  businessId,
  locationId,
  transferId,
  items,
}: {
  slug: string;
  businessId: string;
  locationId: string;
  transferId: string;
  items: Item[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, String(i.qty_requested)])),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const qtySent = items.map((i) => ({ itemId: i.id, qty: Number(values[i.id]) || 0 }));
    fulfillTransferPortal(slug, businessId, locationId, transferId, qtySent)
      .then((res) => {
        setPending(false);
        if (res.error) {
          setError(res.error);
          return;
        }
        router.refresh();
      })
      .catch(() => {
        setPending(false);
        setError("Gagal terhubung ke server. Cek koneksi internet lalu coba lagi.");
      });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border-t border-amber-100 bg-white px-4 py-3">
      {items.map((i) => (
        <div key={i.id} className="flex items-center justify-between gap-2 text-xs">
          <span className="min-w-0 flex-1 truncate text-zinc-700">
            {i.item_name} <span className="text-zinc-400">(diminta {i.qty_requested} {i.unit})</span>
          </span>
          <input
            type="number"
            min="0"
            step="any"
            value={values[i.id] ?? ""}
            onChange={(e) => setValues((prev) => ({ ...prev, [i.id]: e.target.value }))}
            className="w-24 shrink-0 rounded-lg border border-zinc-200 px-2 py-1 text-right focus:border-brand-600 focus:outline-none"
          />
        </div>
      ))}
      {error && <p className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Mengirim…" : "Kirim"}
      </button>
    </form>
  );
}
