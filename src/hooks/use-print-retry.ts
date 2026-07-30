"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { retryPendingPrintJobs } from "@/lib/dispatch-print-jobs";
import { discardPendingPrint, listPendingPrints, type PendingPrintJob } from "@/lib/print-queue";

const RETRY_INTERVAL_MS = 20000;

// Dipakai di pos-screen.tsx. Printer dapur/bar yang mati saat sebuah tiket
// coba dikirim (lihat dispatch-print-jobs.ts) masuk ke antrian lokal —
// hook ini yang coba kirim ulang berkala sampai berhasil atau mentok
// MAX_ATTEMPTS (lihat print-queue.ts), sama polanya dengan useOfflineSync
// untuk penjualan offline.
export function usePrintRetry(businessId: string) {
  const [pending, setPending] = useState<PendingPrintJob[]>([]);
  const retryingRef = useRef(false);

  const refresh = useCallback(async () => {
    const rows = await listPendingPrints(businessId);
    setPending(rows);
    return rows;
  }, [businessId]);

  const retryNow = useCallback(async () => {
    if (retryingRef.current) return;
    retryingRef.current = true;
    try {
      await retryPendingPrintJobs(businessId);
    } finally {
      retryingRef.current = false;
      await refresh();
    }
  }, [businessId, refresh]);

  const discard = useCallback(
    async (id: string) => {
      await discardPendingPrint(id);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function handleOnline() {
      void retryNow();
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [retryNow]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (pending.some((p) => p.status === "pending")) void retryNow();
    }, RETRY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pending, retryNow]);

  return { pending, retryNow, discard };
}
