import Link from "next/link";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

const LAST_UPDATED = "9 Juli 2026";

const SECTIONS = [
  {
    title: "1. Penerimaan Ketentuan",
    body: [
      "Dengan membuat akun dan/atau menggunakan KasirKu (\"Layanan\"), kamu (\"Pengguna\") menyetujui untuk terikat oleh Syarat & Ketentuan ini. Kalau kamu menggunakan Layanan atas nama sebuah usaha, kamu menyatakan punya wewenang untuk mengikat usaha tersebut pada ketentuan ini.",
      "Kalau kamu tidak setuju dengan sebagian atau seluruh ketentuan ini, jangan gunakan Layanan.",
    ],
  },
  {
    title: "2. Deskripsi Layanan",
    body: [
      "KasirKu adalah aplikasi kasir dan manajemen operasional berbasis web untuk usaha F&B, retail, dan tempat wisata — mencakup transaksi kasir, manajemen stok, resep/HPP, payroll, akuntansi, dan laporan terkait.",
      "Kami dapat menambah, mengubah, atau menghentikan sebagian fitur Layanan dari waktu ke waktu untuk peningkatan produk, dengan pemberitahuan yang wajar bila perubahan tersebut berdampak signifikan pada Pengguna.",
    ],
  },
  {
    title: "3. Pendaftaran Akun & Keamanan",
    body: [
      "Kamu wajib memberikan informasi yang akurat saat mendaftar dan menjaga kerahasiaan kredensial akun (email, password, serta PIN kasir/manajer yang kamu buat untuk staf). Kamu bertanggung jawab atas seluruh aktivitas yang terjadi melalui akunmu, termasuk yang dilakukan staf yang kamu beri akses.",
      "Segera beri tahu kami kalau kamu menduga ada akses tidak sah ke akunmu.",
    ],
  },
  {
    title: "4. Biaya dan Pembayaran",
    body: [
      "Ketentuan biaya berlangganan, metode pembayaran, dan kebijakan pengembalian dana akan diinformasikan secara terpisah pada saat fitur penagihan tersedia di Layanan. Sampai saat itu, penggunaan Layanan diatur berdasarkan kesepakatan yang berlaku antara kamu dan KasirKu di luar aplikasi.",
      "Kami akan memberi pemberitahuan sebelum perubahan skema biaya berlaku untuk akun yang sudah aktif.",
    ],
  },
  {
    title: "5. Data dan Kepemilikan Konten",
    body: [
      "Seluruh data transaksi, produk, karyawan, pelanggan, dan data operasional lain yang kamu masukkan ke Layanan (\"Data Pengguna\") tetap menjadi milikmu. KasirKu bertindak sebagai penyedia layanan yang memproses Data Pengguna untuk menjalankan fungsi aplikasi, bukan pemilik data tersebut.",
      "Setiap toko/bisnis yang kamu daftarkan terisolasi secara teknis dari toko milik pengguna lain — lihat Kebijakan Privasi kami untuk detail bagaimana data dikelola dan dilindungi.",
      "Kamu bertanggung jawab atas keakuratan dan legalitas Data Pengguna yang kamu masukkan, termasuk kepatuhan terhadap kewajiban perpajakan dan pelaporan usahamu sendiri.",
    ],
  },
  {
    title: "6. Kewajiban Pengguna",
    body: [
      "Kamu setuju untuk tidak menggunakan Layanan untuk tujuan ilegal, menyalahgunakan sistem (termasuk mencoba mengakses data toko lain tanpa izin), atau mengganggu ketersediaan Layanan bagi pengguna lain.",
      "Kamu bertanggung jawab memastikan staf yang kamu beri akses (kasir, manajer) memahami dan mematuhi ketentuan penggunaan yang wajar terhadap Layanan.",
    ],
  },
  {
    title: "7. Kekayaan Intelektual",
    body: [
      "Aplikasi KasirKu, termasuk kode sumber, desain antarmuka, dan mereknya, adalah milik KasirKu dan dilindungi hukum kekayaan intelektual yang berlaku. Syarat & Ketentuan ini tidak memberikan hak kepemilikan apa pun atas Layanan kepada Pengguna, kecuali hak pakai terbatas untuk menjalankan operasional usahamu sendiri.",
    ],
  },
  {
    title: "8. Ketersediaan Layanan & Batasan Tanggung Jawab",
    body: [
      "Kami berupaya menjaga Layanan tetap tersedia dan berjalan dengan baik, tapi Layanan disediakan \"sebagaimana adanya\" tanpa jaminan bebas gangguan atau bebas kesalahan sepenuhnya. Kami tidak bertanggung jawab atas kerugian tidak langsung, kehilangan keuntungan, atau kehilangan data yang timbul dari gangguan Layanan di luar kendali wajar kami.",
      "Kamu bertanggung jawab menjaga cadangan/catatan operasional pentingmu sendiri di luar Layanan sebagai langkah kehati-hatian.",
    ],
  },
  {
    title: "9. Penangguhan dan Penghentian Akun",
    body: [
      "Kami dapat menangguhkan atau menghentikan akses akunmu apabila terjadi pelanggaran Syarat & Ketentuan ini, aktivitas mencurigakan yang mengancam keamanan Layanan atau pengguna lain, atau atas permintaanmu sendiri.",
      "Kamu dapat berhenti menggunakan Layanan kapan saja. Ketentuan mengenai akses ke Data Pengguna setelah akun ditutup akan mengikuti Kebijakan Privasi kami.",
    ],
  },
  {
    title: "10. Perubahan Ketentuan",
    body: [
      "Kami dapat memperbarui Syarat & Ketentuan ini dari waktu ke waktu. Perubahan material akan diinformasikan melalui email terdaftar atau notifikasi di dalam aplikasi. Penggunaan Layanan setelah perubahan berlaku dianggap sebagai persetujuan atas ketentuan yang diperbarui.",
    ],
  },
  {
    title: "11. Hukum yang Berlaku",
    body: [
      "Syarat & Ketentuan ini diatur dan ditafsirkan berdasarkan hukum Republik Indonesia. Setiap perselisihan yang timbul akan diupayakan diselesaikan secara musyawarah terlebih dahulu.",
    ],
  },
  {
    title: "12. Kontak",
    body: [
      "Kalau ada pertanyaan mengenai Syarat & Ketentuan ini, silakan hubungi kami melalui alamat kontak yang tercantum di aplikasi atau situs KasirKu.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="flex-1">
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl">Syarat &amp; Ketentuan</h1>
        <p className="mt-2 text-sm text-zinc-500">Terakhir diperbarui: {LAST_UPDATED}</p>

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
          <b>Catatan:</b> dokumen ini adalah draf awal untuk keperluan operasional KasirKu dan
          belum ditinjau oleh konsultan hukum. Sebaiknya direview oleh profesional hukum sebelum
          dijadikan dasar hukum yang mengikat secara formal.
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
          <Link href="/privacy" className="font-medium text-brand-600 hover:underline">
            Kebijakan Privasi
          </Link>{" "}
          kami.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
