"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { checkout } from "@/app/business/[businessId]/pos/actions";
import { checkoutTicket } from "@/app/business/[businessId]/pos/ticket-actions";
import {
  discardPending,
  enqueueSale,
  listPending,
  markError,
  markSynced,
  markSyncing,
  type PendingSale,
} from "@/lib/offline-queue";

const SYNC_INTERVAL_MS = 20000;

// Dipakai di pos-screen.tsx & ticket-pos-screen.tsx. Melacak status
// online/offline browser, menyimpan/membaca antrian penjualan tertunda dari
// IndexedDB, dan mencoba sinkronkan ulang otomatis begitu koneksi kembali.
// Lihat rencana di plan file untuk kenapa desainnya begini — intinya: retry
// harus berurutan (bukan paralel) supaya konflik nomor tiket fisik
// terdeteksi satu-satu, dan idempotency (clientRef) di server yang menjamin
// retry yang mengulang penjualan yang sebenarnya sudah sukses tidak
// membuat transaksi duplikat.
export function useOfflineSync(businessId: string) {
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [pending, setPending] = useState<PendingSale[]>([]);
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => {
    const rows = await listPending(businessId);
    setPending(rows);
    return rows;
  }, [businessId]);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    syncingRef.current = true;
    try {
      const rows = await refresh();
      for (const sale of rows) {
        // Sudah gagal karena alasan bisnis (bukan jaringan) sebelumnya —
        // butuh tinjauan manual, jangan di-retry otomatis terus-menerus.
        if (sale.status === "error") continue;

        await markSyncing(sale);
        try {
          const result =
            sale.kind === "retail"
              ? await checkout(
                  sale.businessId,
                  sale.payload.cashierId,
                  sale.payload.items,
                  sale.payload.paymentMethod,
                  sale.payload.received,
                  sale.payload.orderDisc,
                  sale.payload.orderDiscType,
                  sale.payload.customerId,
                  sale.payload.selfOrderIds,
                  sale.clientRef,
                )
              : await checkoutTicket(
                  sale.businessId,
                  sale.payload.cashierId,
                  sale.payload.items,
                  sale.payload.paymentMethod,
                  sale.payload.received,
                  sale.payload.memberId,
                  sale.clientRef,
                );

          if (result.success) {
            await markSynced(sale.clientRef);
          } else {
            await markError(sale, result.error);
          }
        } catch {
          // Masih gagal jaringan (timeout/koneksi putus lagi) — kembalikan
          // ke "pending", coba lagi di siklus sync berikutnya.
          await enqueueSale({ ...sale, status: "pending" });
        }
      }
    } finally {
      syncingRef.current = false;
      await refresh();
    }
  }, [refresh]);

  const discard = useCallback(
    async (clientRef: string) => {
      await discardPending(clientRef);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    listPending(businessId).then(setPending);

    function handleOnline() {
      setIsOnline(true);
      void syncNow();
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [businessId, syncNow]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (pending.length > 0) void syncNow();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pending.length, syncNow]);

  return { isOnline, pending, syncNow, discard };
}
