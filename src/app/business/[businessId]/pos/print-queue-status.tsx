"use client";

import { useState, useRef, useEffect } from "react";
import type { PendingPrintJob } from "@/lib/print-queue";

export default function PrintQueueStatus({
  pending,
  onRetryNow,
  onDiscard,
}: {
  pending: PendingPrintJob[];
  onRetryNow: () => void;
  onDiscard: (id: string) => void;
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

  if (pending.length === 0) return null;

  const errorCount = pending.filter((p) => p.status === "error").length;
  const isError = errorCount > 0;

  function discardAll() {
    pending.filter((p) => p.status === "error").forEach((p) => onDiscard(p.id));
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-xl border px-2 py-1.5 text-xs font-medium ${
          isError
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-amber-200 bg-amber-50 text-amber-700"
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${isError ? "bg-red-500" : "bg-amber-500"}`} />
        🖨️ {pending.length}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-xl border border-zinc-200 bg-white p-2 text-left shadow-lg">
          <div className="flex items-center justify-between px-1 pb-1">
            <p className="text-[11px] font-semibold text-zinc-500">
              Cetak tertunda ({pending.length})
            </p>
            {errorCount > 0 && (
              <button
                type="button"
                onClick={discardAll}
                className="text-[11px] font-medium text-red-600 hover:underline"
              >
                Hapus Semua
              </button>
            )}
          </div>
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
          <button
            type="button"
            onClick={() => { onRetryNow(); setOpen(false); }}
            className="mt-2 w-full rounded-lg bg-zinc-100 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-200"
          >
            Coba Cetak Ulang Sekarang
          </button>
        </div>
      )}
    </div>
  );
}
