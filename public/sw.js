// Service worker manual (bukan plugin build-time) — Serwist/next-pwa belum
// jelas kompatibel dengan Turbopack yang dipakai proyek ini (lihat catatan
// resmi di node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md).
// Cakupan sengaja dibatasi ketat: hanya halaman POS + aset statis yang dapat
// fallback offline. Halaman lain (Neraca, Laporan, dst.) sengaja TIDAK
// disentuh sama sekali di sini — menampilkan data keuangan basi seolah live
// itu berbahaya, beda kelas risiko dengan kasir yang memang didesain toleran
// terhadap data stok/harga yang agak basi.
const CACHE_NAME = "kasirku-pos-v1";

const STATIC_PREFIXES = ["/_next/static/"];
const EXTRA_ALLOWED_PATHS = ["/favicon.ico", "/manifest.webmanifest"];
const POS_PATH_RE = /^\/business\/[^/]+\/pos(\/check-in)?\/?$/;

function isAllowedPath(pathname) {
  if (STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  if (EXTRA_ALLOWED_PATHS.includes(pathname)) return true;
  return POS_PATH_RE.test(pathname);
}

self.addEventListener("install", () => {
  self.skipWaiting();
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
      .catch(() => caches.match(request).then((cached) => cached || Response.error())),
  );
});
