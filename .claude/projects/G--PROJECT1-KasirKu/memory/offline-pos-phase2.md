---
name: offline-pos-phase2
description: "Mode offline kasir Fase 2 — cold-start via Service Worker, built & verified 2026-07-13"
metadata:
  type: project
  originSessionId: current
---

Lanjutan [[offline-pos-phase1]] (mid-session resilience). Fase 2 menutup gap yang sengaja ditunda Fase 1: tab POS yang di-refresh atau dibuka dari kondisi **benar-benar offline** sekarang tetap bisa render, lewat service worker manual (bukan plugin build-time — riset ke `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` menemukan opsi resmi Serwist "currently requires webpack configuration", belum jelas kompatibel dengan Turbopack yang dipakai proyek ini).

**Temuan penting soal Next.js 16 di repo ini**: `middleware.ts` sudah tidak dipakai lagi sebagai nama convention — sekarang **`proxy.ts`** (fungsinya identik, cuma nama file/istilah berubah, lihat `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`). File root proyek ini: `src/proxy.ts` (memanggil `updateSession` dari `src/lib/supabase/middleware.ts`, yang nama filenya sendiri TIDAK berubah). Kalau nyari middleware di masa depan, cari `proxy.ts` dulu.

**Arsitektur**: `public/sw.js` (baru, vanilla JS tanpa dependency) — pada event `fetch`, hanya intersep request **GET** yang **same-origin** dan path-nya masuk allowlist (`/_next/static/*`, `/business/*/pos`, `/business/*/pos/check-in`, `/favicon.ico`, `/manifest.webmanifest`); selain itu dibiarkan lewat begitu saja (termasuk semua Server Action yang selalu POST — jadi checkout Fase 1 sama sekali tidak tersentuh SW). Untuk request dalam allowlist: strategi **network-first, fallback ke cache** (`caches.open('kasirku-pos-v1')`) — selama online SW tidak pernah menyajikan yang basi, cache betul-betul cuma jaring pengaman saat fetch gagal total.

**Kenapa scope dibatasi ketat ke rute POS saja (bukan seluruh app)**: menyajikan halaman keuangan (Neraca/Laporan/Laba Rugi) dari cache basi seolah live itu berbahaya — beda kelas risiko dari kasir yang memang sudah didesain Fase 1 untuk toleran terhadap stok/harga yang agak basi. Ini keputusan desain sadar, bukan keterbatasan teknis.

**Registrasi SW**: ditambahkan ke `src/hooks/use-offline-sync.ts` (hook yang sama dari Fase 1, dipakai `pos-screen.tsx` & `ticket-pos-screen.tsx`) — `navigator.serviceWorker.register('/sw.js', {scope:'/', updateViaCache:'none'})` di `useEffect` terpisah, idempotent.

**`src/app/manifest.ts`** (baru, App Router convention) — bikin POS bisa "Add to Home Screen" di HP/tablet kasir. Icon pakai `src/app/favicon.ico` yang sudah ada (tidak perlu bikin aset baru). `start_url: "/dashboard"` (generik, aman untuk akun multi-toko).

**`next.config.ts`** — tambah `headers()` untuk `/sw.js`: `Cache-Control: no-cache, no-store, must-revalidate`, supaya update service worker langsung kepakai, bukan nyangkut di HTTP cache browser.

**Verifikasi E2E di browser (2026-07-13, Toko Test Laporan, akun [[test-account-preview]])**: SW ter-`register` & `activated` (dicek via `navigator.serviceWorker.getRegistrations()`). Reload halaman POS → Cache Storage `kasirku-pos-v1` terisi halaman POS (varian penuh + RSC `?_rsc=`) plus ~20 chunk `_next/static`. **Uji ekstrem**: dev server dimatikan total (`preview_stop`) lalu reload tab POS dari nol → halaman **tetap render penuh** (produk, keranjang, semua tombol) meski server benar-benar mati — bukti cold-start offline bekerja. Navigasi ke halaman dashboard non-POS (`/business/<id>`) saat server masih mati → gagal total dengan halaman error koneksi bawaan browser (bukan konten basi) — bukti allowlist scoping benar, TIDAK ada kebocoran cache ke rute finansial. Setelah server dinyalakan lagi, checkout online sungguhan berhasil dengan invoice asli, tanpa error — SW tidak mengganggu Server Action (POST) sama sekali, tidak ada regresi ke Fase 1.

**Batasan yang sengaja diterima**: Cache Storage per-origin bukan per-user — device yang dipakai gantian beberapa kasir/toko tanpa sempat online lagi bisa menampilkan snapshot sesi sebelumnya (risiko rendah, bukan data finansial, auto-refresh begitu online). Cetak struk/kitchen printer tetap butuh network (belum diselesaikan, sama seperti Fase 1). Deploy baru yang naik saat device offline lama butuh satu kali load sukses dulu sebelum cache ter-update — normal untuk pola network-first.

**How to apply**: tidak ada migrasi DB baru di Fase 2 ini (murni perubahan client-side + config). Tidak ada langkah manual yang perlu dilakukan user — begitu dideploy, SW otomatis terdaftar saat kasir pertama kali buka halaman POS.
