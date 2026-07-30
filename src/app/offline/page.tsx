// Fallback yang disajikan service worker (public/sw.js) untuk navigasi ke
// halaman yang belum pernah dibuka sebelumnya SAAT offline — tanpa ini,
// WebView menampilkan layar error koneksi mentah bawaan Android. Harus
// statis total (tanpa fetch data apa pun) supaya tetap bisa render dari
// cache kapan saja, termasuk sebelum pernah online sekali pun.
export default function OfflinePage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-zinc-50 px-6 text-center">
      <p className="text-4xl">📴</p>
      <h1 className="mt-3 text-lg font-bold text-zinc-900">Kamu sedang offline</h1>
      <p className="mt-1.5 max-w-xs text-sm text-zinc-500">
        Halaman ini belum pernah dibuka sebelumnya, jadi belum tersimpan untuk dilihat offline.
        Buka halaman yang sudah pernah dikunjungi, atau coba lagi setelah tersambung ke internet.
      </p>
    </div>
  );
}
