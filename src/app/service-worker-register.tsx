"use client";

import { useEffect } from "react";

// Dipasang di root layout supaya SW terdaftar begitu HALAMAN APA PUN
// dibuka pertama kali — sebelumnya cuma didaftarkan di use-offline-sync.ts
// (dipakai pos-screen.tsx), jadi kasir yang buka Riwayat/Pengaturan
// sebelum pernah buka POS tidak punya cache sama sekali. Idempotent, aman
// dipanggil berkali-kali/tiap mount.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {});
    }
  }, []);

  return null;
}
