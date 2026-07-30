// Service worker manual (bukan plugin build-time) — Serwist/next-pwa belum
// jelas kompatibel dengan Turbopack yang dipakai proyek ini (lihat catatan
// resmi di node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md).
//
// Fase 3 (2026-07-30): cakupan diperluas dari POS-saja ke SELURUH halaman
// bisnis (Riwayat, Pengaturan, Laporan/Keuangan termasuk) — user secara
// eksplisit minta ini, sadar & menerima trade-off-nya: offline bisa
// menampilkan data yang sudah tidak terbaru. Mitigasinya BUKAN di sini,
// tapi banner app-wide di src/app/offline-banner.tsx yang selalu tampil
// selagi navigator.onLine === false, supaya tidak ada halaman yang terlihat
// live padahal sebenarnya snapshot lama. Halaman publik/marketing sengaja
// tetap di luar cakupan — tidak berguna offline, tidak perlu di-cache.
//
// /login DIKECUALIKAN dari "halaman publik" itu: android-app/capacitor.config.ts
// selalu buka app Android persis di /login setiap cold-launch (bukan
// halaman kasir terakhir) — kalau /login tidak ke-cache, app tidak akan
// pernah bisa dibuka sama sekali saat offline meski kasir/halaman lain
// sudah tersimpan. login/page.tsx sendiri yang urus redirect otomatis
// begitu terdeteksi sesi lokal masih ada (lihat komentar di file itu).
// PENTING: /offline dan /login di-cache HANYA lewat install event di bawah
// (bukan network-first biasa — user tidak pernah "mengunjungi" /offline
// secara online, jadi baris fetch handler tidak pernah sempat
// menyegarkannya). Itu artinya isinya beku sampai install event ini
// jalan lagi — yang HANYA terjadi kalau browser mendeteksi byte sw.js ini
// beda dari yang ter-install. Jadi: tiap kali /offline atau /login
// berubah isinya, WAJIB naikkan versi CACHE_NAME di sini juga, walau tidak
// ada baris lain di file ini yang berubah — kalau tidak, HP kasir akan
// terus menyajikan versi lama tanpa update sampai bertahun-tahun.
const CACHE_NAME = "kasirku-app-v2";

const STATIC_PREFIXES = ["/_next/static/"];
const EXTRA_ALLOWED_PATHS = ["/favicon.ico", "/manifest.webmanifest", "/offline", "/login"];
const APP_PATH_RE = /^\/dashboard\/?$|^\/business\/[^/]+(\/.*)?$/;

function isAllowedPath(pathname) {
  if (STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  if (EXTRA_ALLOWED_PATHS.includes(pathname)) return true;
  return APP_PATH_RE.test(pathname);
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  // Cache /offline dan /login dari awal — /offline supaya fallback-nya
  // sendiri tidak bisa "belum ke-cache" saat dibutuhkan, /login supaya
  // gerbang masuk app Android (lihat komentar di atas) ada isinya bahkan
  // sebelum sempat online sekali pun setelah SW baru terpasang.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(["/offline", "/login"])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!isAllowedPath(url.pathname)) return;

  // Network-first: selama online, SW tidak pernah menyajikan konten basi —
  // cache murni jaring pengaman saat fetch benar-benar gagal (offline).
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          // Belum pernah dibuka sama sekali (tidak ada cache) DAN sekarang
          // offline — daripada layar error mentah bawaan WebView, tampilkan
          // halaman /offline yang jelas masih bagian dari app.
          if (request.mode === "navigate") {
            return caches.match("/offline").then((offline) => offline || Response.error());
          }
          return Response.error();
        }),
      ),
  );
});
