"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { receiveFulfillmentPublic } from "./actions";

type Employee = { id: string; name: string };
type PendingItem = { id: string; item_name: string; unit: string | null; qty: number; marked_at: string };

export default function ReceiveClient({
  slug,
  businessName,
  locationName,
  employees,
  pending,
}: {
  slug: string;
  businessName: string;
  locationName: string;
  employees: Employee[];
  pending: PendingItem[];
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function handleReceive(fulfillmentId: string) {
    if (!employeeId) {
      setError("Pilih nama dulu.");
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setProcessingId(fulfillmentId);
    receiveFulfillmentPublic(slug, fulfillmentId, employeeId)
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
    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">{businessName}</p>
      <h1 className="mt-1 text-center text-lg font-bold text-zinc-900">Terima Barang dari Gudang</h1>
      <p className="mt-1 text-center text-[11px] text-zinc-400">Lokasi: {locationName}</p>

      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-zinc-600">Nama Anda</label>
        <select
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">— Pilih nama —</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 space-y-2">
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
