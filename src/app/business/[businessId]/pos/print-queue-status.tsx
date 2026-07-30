"use client";

import type { PendingPrintJob } from "@/lib/print-queue";

// Pill kecil di header POS, hanya muncul kalau ada tiket/struk yang gagal
// terkirim ke printer dan sedang diantre retry — kuning selagi masih
// dicoba otomatis, merah kalau sudah mentok MAX_ATTEMPTS dan butuh cetak
// ulang manual (lewat halaman detail transaksi). Sengaja disembunyikan
// total kalau antrian kosong, beda dari OfflineStatus yang selalu tampil.
export default function PrintQueueStatus({
  pending,
  onRetryNow,
  onDiscard,
}: {
  pending: PendingPrintJob[];
  onRetryNow: () => void;
  onDiscard: (id: string) => void;
}) {
  if (pending.length === 0) return null;

  const errorCount = pending.filter((p) => p.status === "error").length;
  const waitingCount = pending.length - errorCount;

  return (
    <div className="group relative shrink-0">
      <button
        type="button"
        onClick={onRetryNow}
        className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium ${
          errorCount > 0
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-amber-200 bg-amber-50 text-amber-700"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${errorCount > 0 ? "bg-red-500" : "bg-amber-500"}`}
        />
        🖨️
        {waitingCount > 0 && ` ${waitingCount} tertunda`}
        {errorCount > 0 && ` · ${errorCount} gagal`}
      </button>

      <div className="invisible absolute right-0 top-full z-20 mt-1 w-72 rounded-xl border border-zinc-200 bg-white p-2 text-left opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100">
        <p className="px-1 pb-1 text-[11px] font-semibold text-zinc-500">
          Cetak tertunda ({pending.length})
        </p>
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {pending.map((p) => (
            <li key={p.id} className="rounded-lg bg-zinc-50 px-2 py-1.5 text-[11px] text-zinc-600">
              <div className="flex items-center justify-between gap-2">
                <span>
                  {p.job.printerName} · {new Date(p.createdAt).toLocaleTimeString("id-ID")}
                </span>
                {p.status === "error" && (
                  <button
                    type="button"
                    onClick={() => onDiscard(p.id)}
                    className="shrink-0 text-red-600 hover:underline"
                  >
                    Hapus
                  </button>
                )}
              </div>
              {p.status === "error" && (
                <p className="mt-0.5 text-red-600">
                  Gagal {p.attempts}x — cetak ulang manual lewat halaman transaksi.
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
