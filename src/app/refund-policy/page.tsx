import type { Metadata } from "next";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Kebijakan Pengembalian Dana — CreateImpact",
  description: "Kebijakan refund dan pengembalian dana untuk layanan KasirKu oleh CreateImpact.",
};

export default function RefundPolicyPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="mb-2 text-3xl font-bold text-zinc-900">Kebijakan Pengembalian Dana</h1>
        <p className="mb-10 text-zinc-500">Terakhir diperbarui: Agustus 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-zinc-600">
          <section>
            <h2 className="mb-3 text-base font-semibold text-zinc-900">1. Umum</h2>
            <p>
              CreateImpact berkomitmen untuk memberikan layanan terbaik melalui aplikasi KasirKu.
              Kami memahami bahwa dalam kondisi tertentu, pengguna mungkin memerlukan pengembalian
              dana. Kebijakan ini menjelaskan kondisi dan prosedur pengembalian dana.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-zinc-900">2. Syarat Pengembalian Dana</h2>
            <p>Pengembalian dana dapat diajukan dalam kondisi berikut:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Pembayaran ganda (double charge) akibat kesalahan sistem.</li>
              <li>
                Layanan tidak dapat diakses selama lebih dari 72 jam berturut-turut akibat
                gangguan dari pihak kami.
              </li>
              <li>Permintaan diajukan dalam 7 hari kalender sejak tanggal pembayaran.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-zinc-900">3. Kondisi yang Tidak Dapat Direfund</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Langganan yang sudah digunakan sebagian atau seluruhnya.</li>
              <li>Permintaan yang diajukan lebih dari 7 hari kalender sejak tanggal pembayaran.</li>
              <li>Pembatalan yang disebabkan oleh pelanggaran Syarat & Ketentuan penggunaan.</li>
              <li>Perubahan keputusan bisnis pengguna.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-zinc-900">4. Prosedur Pengajuan</h2>
            <p>Untuk mengajukan pengembalian dana, ikuti langkah berikut:</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Kirim email ke create2impact.id@gmail.com dengan subjek &quot;Refund &ndash; [Nama Akun]&quot;.</li>
              <li>Sertakan bukti pembayaran dan alasan pengajuan refund.</li>
              <li>Tim kami akan merespons dalam 3 hari kerja.</li>
              <li>Jika disetujui, dana dikembalikan dalam 7–14 hari kerja ke metode pembayaran asal.</li>
            </ol>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-zinc-900">5. Kontak</h2>
            <p>
              Pertanyaan terkait kebijakan ini dapat disampaikan melalui:{" "}
              <a href="mailto:create2impact.id@gmail.com" className="text-brand-600 hover:underline">
                create2impact.id@gmail.com
              </a>{" "}
              atau WhatsApp{" "}
              <a href="https://wa.me/6281234556757" className="text-brand-600 hover:underline">
                081234556757
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
