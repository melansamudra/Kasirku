"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { receiveStockFulfillment } from "../../../permintaan-barang/actions";

export default function ReceiveFulfillmentButton({
  businessId,
  fulfillmentId,
  employees,
}: {
  businessId: string;
  fulfillmentId: string;
  employees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [receivedBy, setReceivedBy] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleReceive() {
    if (!receivedBy) {
      setError("Pilih nama penerima dulu.");
      return;
    }
    setError(null);
    setPending(true);
    receiveStockFulfillment(businessId, fulfillmentId, receivedBy)
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
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        value={receivedBy}
        onChange={(e) => setReceivedBy(e.target.value)}
        disabled={pending}
        className="rounded-lg border border-zinc-200 px-2 py-1 text-[11px] focus:border-brand-600 focus:outline-none"
      >
        <option value="">— Diterima oleh —</option>
        {employees.map((e) => (
          <option key={e.id} value={e.name}>
            {e.name}
          </option>
        ))}
      </select>
      <button
        onClick={handleReceive}
        disabled={pending}
        className="rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Memproses…" : "Terima & Masukkan Stok"}
      </button>
      {error && <p className="w-full text-[10.5px] text-red-600">{error}</p>}
    </div>
  );
}
