"use client";

import { useState, useRef, useEffect } from "react";
import type { PendingSale } from "@/lib/offline-queue";

// Pill kecil di header POS: hijau kalau online & tidak ada antrian, kuning
// kalau offline atau ada transaksi menunggu sync, merah kalau ada transaksi
// yang gagal sync karena alasan bisnis (bukan jaringan) dan butuh tinjauan
// manual — mis. nomor tiket fisik bentrok.
export default function OfflineStatus({
  isOnline,
  pending,
  onSyncNow,
  onDiscard,
}: {
  isOnline: boolean;
  pending: PendingSale[];
  onSyncNow: () => void;
  onDiscard: (clientRef: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  const errorCount = pending.filter((p) => p.status === "error").length;
  const waitingCount = pending.length - errorCount;

  if (isOnline && pending.length === 0) {
    return (
      <div className="hidden shrink-0 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 sm:flex">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online
      </div>
    );
  }

  function discardAll() {
    pending.filter((p) => p.status === "error").forEach((p) => onDiscard(p.clientRef));
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium ${
          errorCount > 0
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-amber-200 bg-amber-50 text-amber-700"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${errorCount > 0 ? "bg-red-500" : "bg-amber-500"}`}
        />
        {!isOnline && "Offline"}
        {isOnline && waitingCount > 0 && "Menyinkronkan…"}
        {errorCount > 0 && ` · ${errorCount} perlu ditinjau`}
        {isOnline && errorCount === 0 && waitingCount > 0 && ` · ${waitingCount} menunggu`}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-xl border border-zinc-200 bg-white p-2 text-left shadow-lg">
          <div className="flex items-center justify-between px-1 pb-1">
            <p className="text-[11px] font-semibold text-zinc-500">
              Transaksi offline ({pending.length})
            </p>
            {errorCount > 0 && (
              <button
                type="button"
                onClick={discardAll}
                className="text-[11px] font-medium text-red-600 hover:underline"
              >
                Hapus Semua Error
              </button>
            )}
          </div>
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {pending.map((sale) => (
              <li
                key={sale.clientRef}
                className="rounded-lg bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-600"
              >
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {sale.kind === "ticket" ? "🎟️ Tiket" : "🛒 Penjualan"} ·{" "}
                    {new Date(sale.createdAt).toLocaleTimeString("id-ID")}
                  </span>
                  {sale.status === "error" && (
                    <button
                      type="button"
                      onClick={() => { onDiscard(sale.clientRef); }}
                      className="shrink-0 text-red-600 hover:underline"
                    >
                      Hapus
                    </button>
                  )}
                </div>
                {sale.status === "error" && sale.errorMessage && (
                  <p className="mt-0.5 text-red-600">{sale.errorMessage}</p>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => { onSyncNow(); setOpen(false); }}
            className="mt-2 w-full rounded-lg bg-zinc-100 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-200"
          >
            Coba Sinkronkan Sekarang
          </button>
        </div>
      )}
    </div>
  );
}
