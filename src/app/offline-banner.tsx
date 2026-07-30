"use client";

import { useEffect, useState } from "react";

// Banner app-wide (bukan cuma POS) — mitigasi utama untuk risiko data
// keuangan basi ditampilkan seolah live sejak cakupan offline diperluas ke
// semua halaman (lihat public/sw.js). Read-only, tidak ada antrian/retry
// di sini — itu tetap eksklusif punya POS (use-offline-sync.ts).
export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
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
  }, []);

  if (isOnline) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-1.5 bg-amber-500 px-3 py-1.5 text-center text-xs font-medium text-white">
      📴 Offline — data yang ditampilkan mungkin bukan yang terbaru
    </div>
  );
}
