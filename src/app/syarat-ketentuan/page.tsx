import type { Metadata } from "next";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Syarat & Ketentuan — CreateImpact",
  description: "Syarat dan ketentuan penggunaan layanan KasirKu oleh CreateImpact.",
};

export default function SyaratKetentuanPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="mb-2 text-3xl font-bold text-zinc-900">Syarat & Ketentuan</h1>
        <p className="mb-10 text-zinc-500">Terakhir diperbarui: Agustus 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-zinc-600">
          <section>
            <h2 className="mb-3 text-base font-semibold text-zinc-900">1. Penerimaan Ketentuan</h2>
            <p>
              Dengan mendaftar dan menggunakan layanan KasirKu yang disediakan oleh CreateImpact,
              kamu menyatakan telah membaca, memahami, dan menyetujui syarat dan ketentuan ini.
              Jika tidak menyetujui, harap tidak menggunakan layanan kami.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-zinc-900">2. Definisi</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Layanan</strong>: Aplikasi KasirKu dan seluruh fitur yang tersedia di platform createimpact.id.</li>
              <li><strong>Pengguna</strong>: Individu atau entitas bisnis yang mendaftar dan menggunakan Layanan.</li>
              <li><strong>Kami</strong>: CreateImpact, penyedia Layanan.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-zinc-900">3. Penggunaan Layanan</h2>
            <p>Pengguna setuju untuk:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Menggunakan Layanan hanya untuk tujuan yang sah dan sesuai hukum yang berlaku di Indonesia.</li>
              <li>Tidak menyalahgunakan Layanan untuk kegiatan penipuan, ilegal, atau merugikan pihak lain.</li>
              <li>Menjaga kerahasiaan akun dan bertanggung jawab atas seluruh aktivitas yang terjadi di akun tersebut.</li>
              <li>Memberikan informasi yang akurat dan terkini saat mendaftar.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-zinc-900">4. Akun dan Keamanan</h2>
            <p>
              Pengguna bertanggung jawab penuh atas keamanan akun dan kata sandi. Segera
              hubungi kami jika menduga ada akses tidak sah ke akun kamu. Kami tidak
              bertanggung jawab atas kerugian akibat kelalaian pengguna dalam menjaga keamanan akun.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-zinc-900">5. Pembayaran dan Langganan</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Harga langganan dapat berubah sewaktu-waktu dengan pemberitahuan terlebih dahulu.</li>
              <li>Pembayaran bersifat non-refundable kecuali diatur dalam Kebijakan Pengembalian Dana.</li>
              <li>Keterlambatan pembayaran dapat mengakibatkan pembatasan atau penangguhan akun.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-zinc-900">6. Data dan Privasi</h2>
            <p>
              Penggunaan data pribadi kamu diatur dalam Kebijakan Privasi kami. Dengan
              menggunakan Layanan, kamu menyetujui pengumpulan dan penggunaan data sesuai
              Kebijakan Privasi yang berlaku.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-zinc-900">7. Batasan Tanggung Jawab</h2>
            <p>
              CreateImpact tidak bertanggung jawab atas kerugian tidak langsung, insidental,
              atau konsekuensial yang timbul dari penggunaan atau ketidakmampuan menggunakan
              Layanan, termasuk kehilangan data, gangguan bisnis, atau kerugian finansial.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-zinc-900">8. Penghentian Layanan</h2>
            <p>
              Kami berhak menghentikan atau menangguhkan akses pengguna yang melanggar
              ketentuan ini tanpa pemberitahuan sebelumnya. Pengguna dapat menghentikan
              langganan kapan saja melalui pengaturan akun.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-zinc-900">9. Perubahan Ketentuan</h2>
            <p>
              Kami dapat memperbarui syarat dan ketentuan ini sewaktu-waktu. Perubahan
              signifikan akan diberitahukan melalui email atau notifikasi di aplikasi.
              Penggunaan Layanan setelah perubahan berlaku dianggap sebagai persetujuan.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-zinc-900">10. Hukum yang Berlaku</h2>
            <p>
              Syarat dan ketentuan ini diatur oleh hukum Republik Indonesia. Segala
              perselisihan akan diselesaikan melalui musyawarah mufakat. Jika tidak
              tercapai kesepakatan, penyelesaian dilakukan melalui pengadilan yang berwenang
              di Semarang, Jawa Tengah.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-zinc-900">11. Kontak</h2>
            <p>
              Pertanyaan terkait syarat dan ketentuan ini dapat disampaikan ke:{" "}
              <a href="mailto:create2impact.id@gmail.com" className="text-brand-600 hover:underline">
                create2impact.id@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
