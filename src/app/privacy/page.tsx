import Link from "next/link";
import Logo from "@/components/logo";

const LAST_UPDATED = "9 Juli 2026";

const SECTIONS = [
  {
    title: "1. Pendahuluan",
    body: [
      "Kebijakan Privasi ini menjelaskan bagaimana KasirKu (\"kami\") mengumpulkan, menggunakan, dan melindungi data saat kamu menggunakan Layanan. Dengan menggunakan KasirKu, kamu menyetujui praktik yang dijelaskan di sini — lihat juga Syarat & Ketentuan kami.",
    ],
  },
  {
    title: "2. Data yang Kami Kumpulkan",
    body: [
      "Data akun: email, password (tersimpan terenkripsi/hash, bukan teks biasa), dan riwayat login.",
      "Data operasional yang kamu masukkan sendiri saat memakai Layanan: profil toko, produk & resep, transaksi penjualan, data karyawan/kasir (termasuk PIN yang tersimpan dalam bentuk hash, bukan angka aslinya), data pelanggan/member tokomu, catatan pengeluaran, dan data akuntansi terkait.",
      "Data teknis dasar: alamat IP, jenis perangkat/browser, dan log aktivitas sistem untuk keperluan keamanan dan penyelesaian masalah.",
    ],
  },
  {
    title: "3. Bagaimana Kami Menggunakan Data",
    body: [
      "Data digunakan untuk menjalankan fungsi inti Layanan (mencatat transaksi, menghitung stok/HPP, membuat laporan), menjaga keamanan akun, memberi dukungan teknis, dan meningkatkan kualitas produk.",
      "Kami tidak menggunakan data operasional tokomu untuk kepentingan iklan pihak ketiga.",
    ],
  },
  {
    title: "4. Berbagi Data dengan Pihak Ketiga",
    body: [
      "Kami tidak menjual data Pengguna kepada pihak ketiga. Data dapat diakses oleh penyedia infrastruktur yang kami pakai untuk menjalankan Layanan (misalnya penyedia hosting database dan server) sebatas yang diperlukan untuk operasional teknis, dan mereka terikat kewajiban menjaga kerahasiaan data tersebut.",
      "Kami dapat membuka data apabila diwajibkan oleh hukum yang berlaku, misalnya permintaan resmi dari aparat penegak hukum.",
    ],
  },
  {
    title: "5. Keamanan Data",
    body: [
      "Setiap toko/bisnis yang terdaftar di KasirKu terisolasi secara teknis satu sama lain — pengguna satu toko tidak dapat mengakses data toko lain melalui jalur normal aplikasi.",
      "PIN kasir dan password akun tidak pernah disimpan dalam bentuk teks biasa; keduanya disimpan dalam bentuk hash satu-arah.",
      "Kami mengambil langkah keamanan yang wajar (koneksi terenkripsi/HTTPS, kontrol akses berbasis peran) untuk melindungi data, tapi tidak ada sistem yang bisa menjamin keamanan 100%. Segera hubungi kami kalau kamu menemukan indikasi celah keamanan.",
    ],
  },
  {
    title: "6. Retensi Data",
    body: [
      "Kami menyimpan data operasional tokomu selama akunmu masih aktif. Kalau kamu menutup akun, kami dapat menyimpan data untuk jangka waktu tertentu sesuai kebutuhan hukum/pembukuan sebelum dihapus permanen, kecuali diminta dihapus lebih cepat sesuai ketentuan yang berlaku.",
    ],
  },
  {
    title: "7. Hak Kamu atas Data",
    body: [
      "Kamu berhak mengakses, mengoreksi, atau meminta penghapusan data akun dan data operasional tokomu, sepanjang tidak bertentangan dengan kewajiban pembukuan/hukum yang berlaku bagi usahamu. Hubungi kami melalui kontak yang tercantum di bawah untuk permintaan semacam ini.",
    ],
  },
  {
    title: "8. Data Pelanggan Milik Toko Kamu",
    body: [
      "Kalau kamu memasukkan data pelanggan/member ke dalam KasirKu (nama, nomor telepon, riwayat pembelian, dsb.), kamu bertindak sebagai pengendali data tersebut dan bertanggung jawab memastikan kamu punya dasar yang sah untuk mengumpulkan dan menyimpan data itu (misalnya persetujuan pelanggan). KasirKu bertindak sebagai pemroses teknis atas data tersebut atas instruksimu.",
    ],
  },
  {
    title: "9. Cookie dan Teknologi Serupa",
    body: [
      "Kami menggunakan cookie sesi yang diperlukan agar kamu tetap masuk (login) saat menggunakan Layanan. Cookie ini bersifat esensial untuk fungsi aplikasi, bukan untuk pelacakan iklan.",
    ],
  },
  {
    title: "10. Anak di Bawah Umur",
    body: [
      "Layanan ini ditujukan untuk pelaku usaha dewasa yang mengelola bisnisnya, bukan untuk anak-anak. Kami tidak dengan sengaja mengumpulkan data akun dari anak di bawah umur.",
    ],
  },
  {
    title: "11. Perubahan Kebijakan",
    body: [
      "Kami dapat memperbarui Kebijakan Privasi ini dari waktu ke waktu. Perubahan material akan diinformasikan melalui email terdaftar atau notifikasi di dalam aplikasi.",
    ],
  },
  {
    title: "12. Kontak",
    body: [
      "Kalau ada pertanyaan mengenai Kebijakan Privasi ini atau ingin mengajukan permintaan terkait data pribadimu, silakan hubungi kami melalui alamat kontak yang tercantum di aplikasi atau situs KasirKu.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="flex-1">
      <header className="sticky top-0 z-10 border-b border-zinc-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-9 w-9" />
            <span className="text-base font-bold text-zinc-900">KasirKu</span>
          </Link>
          <Link
            href="/"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            ← Kembali
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl">Kebijakan Privasi</h1>
        <p className="mt-2 text-sm text-zinc-500">Terakhir diperbarui: {LAST_UPDATED}</p>

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
          <b>Catatan:</b> dokumen ini adalah draf awal untuk keperluan operasional KasirKu dan
          belum ditinjau oleh konsultan hukum. Sebaiknya direview oleh profesional hukum —
          termasuk kesesuaiannya dengan UU Pelindungan Data Pribadi (UU PDP) — sebelum dijadikan
          dasar hukum yang mengikat secara formal.
        </div>

        <div className="mt-8 space-y-8">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="text-base font-bold text-zinc-900">{s.title}</h2>
              <div className="mt-2 space-y-2.5">
                {s.body.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-zinc-600">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-zinc-400">
          Lihat juga{" "}
          <Link href="/terms" className="font-medium text-brand-600 hover:underline">
            Syarat &amp; Ketentuan
          </Link>{" "}
          kami.
        </p>
      </main>

      <footer className="border-t border-zinc-100 px-4 py-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="text-sm font-semibold text-zinc-700">KasirKu</span>
          </div>
          <p className="text-xs text-zinc-400">
            © {new Date().getFullYear()} KasirKu. Semua hak dilindungi.
          </p>
        </div>
      </footer>
    </div>
  );
}
