"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { receiveFulfillmentPortal } from "./actions";

type PendingItem = { id: string; item_name: string; unit: string | null; qty: number; marked_at: string };

export default function ReceiveListClient({
  receiveSlug,
  businessId,
  locationId,
  pending,
}: {
  receiveSlug: string;
  businessId: string;
  locationId: string;
  pending: PendingItem[];
}) {
  const router = useRouter();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function handleReceive(fulfillmentId: string) {
    setError(null);
    setSuccessMsg(null);
    setProcessingId(fulfillmentId);
    receiveFulfillmentPortal(receiveSlug, businessId, locationId, fulfillmentId)
      .then((res) => {
        setProcessingId(null);
        if (!res.success) {
          setError(res.error);
          return;
        }
        setSuccessMsg("Berhasil dikonfirmasi diterima.");
        router.refresh();
      })
      .catch(() => {
        setProcessingId(null);
        setError("Gagal terhubung ke server. Cek koneksi internet lalu coba lagi.");
      });
  }

  return (
    <div className="mt-4">
      <div className="space-y-2">
        {pending.length > 0 ? (
          pending.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 px-3.5 py-2.5"
            >
              <div>
                <p className="text-sm font-medium text-zinc-900">{p.item_name}</p>
                <p className="text-xs text-zinc-500">
                  {p.qty}
                  {p.unit ? ` ${p.unit}` : ""}
                </p>
              </div>
              <button
                onClick={() => handleReceive(p.id)}
                disabled={processingId === p.id}
                className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processingId === p.id ? "Memproses…" : "Terima"}
              </button>
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Tidak ada barang yang menunggu diterima saat ini.
          </p>
        )}
      </div>

      {successMsg && (
        <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">{successMsg}</p>
      )}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
