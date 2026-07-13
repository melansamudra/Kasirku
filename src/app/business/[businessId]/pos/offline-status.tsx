"use client";

import type { PendingSale } from "@/lib/offline-queue";

// Pill kecil di header POS: hijau kalau online & tidak ada antrian, kuning
// kalau offline atau ada transaksi menunggu sync, merah kalau ada transaksi
// yang gagal sync karena alasan bisnis (bukan jaringan) dan butuh tinjauan
// manual — mis. nomor tiket fisik bentrok. Dipakai pos-screen.tsx dan
// ticket-pos-screen.tsx.
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
  const errorCount = pending.filter((p) => p.status === "error").length;
  const waitingCount = pending.length - errorCount;

  if (isOnline && pending.length === 0) {
    return (
      <div className="hidden shrink-0 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 sm:flex">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online
      </div>
    );
  }

  return (
    <div className="group relative shrink-0">
      <button
        type="button"
        onClick={onSyncNow}
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
        {waitingCount > 0 && ` · ${waitingCount} menunggu`}
      </button>

      {pending.length > 0 && (
        <div className="invisible absolute right-0 top-full z-20 mt-1 w-72 rounded-xl border border-zinc-200 bg-white p-2 text-left opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100">
          <p className="px-1 pb-1 text-[11px] font-semibold text-zinc-500">
            Transaksi offline ({pending.length})
          </p>
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
                      onClick={() => onDiscard(sale.clientRef)}
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
        </div>
      )}
    </div>
  );
}
