"use client";

// Fallback yang disajikan service worker (public/sw.js) untuk navigasi ke
// halaman yang belum pernah dibuka sebelumnya SAAT offline — tanpa ini,
// WebView menampilkan layar error koneksi mentah bawaan Android. Harus
// statis total (tanpa fetch data server apa pun) supaya tetap bisa render
// dari cache kapan saja, termasuk sebelum pernah online sekali pun — tapi
// tetap butuh tombol navigasi (client-side), karena tanpa itu kasir
// kejebak di sini dan harus paksa-tutup app buat keluar.
export default function OfflinePage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-zinc-50 px-6 text-center">
      <p className="text-4xl">📴</p>
      <h1 className="mt-3 text-lg font-bold text-zinc-900">Kamu sedang offline</h1>
      <p className="mt-1.5 max-w-xs text-sm text-zinc-500">
        Halaman ini belum pernah dibuka sebelumnya, jadi belum tersimpan untuk dilihat offline.
        Buka halaman yang sudah pernah dikunjungi, atau coba lagi setelah tersambung ke internet.
      </p>
      <div className="mt-5 flex w-full max-w-xs flex-col gap-2">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          ← Kembali
        </button>
        <a
          href="/dashboard"
          className="rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          🏠 Ke Dashboard
        </a>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          🔄 Coba Lagi
        </button>
      </div>
    </div>
  );
}
