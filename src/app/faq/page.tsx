import type { Metadata } from "next";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

export const metadata: Metadata = {
  title: "FAQ — CreateImpact",
  description: "Pertanyaan yang sering ditanyakan seputar KasirKu dan layanan CreateImpact.",
};

const FAQS = [
  {
    q: "Apa itu KasirKu?",
    a: "KasirKu adalah aplikasi kasir berbasis web untuk bisnis F&B, retail, dan tempat wisata. Fiturnya mencakup transaksi harian, manajemen stok, laporan keuangan, hingga self-order via QR.",
  },
  {
    q: "Apakah bisa dicoba gratis?",
    a: "Ya, KasirKu tersedia dalam paket gratis dengan fitur dasar. Kamu bisa upgrade ke paket berbayar kapan saja untuk mendapatkan fitur lengkap.",
  },
  {
    q: "Apakah data saya aman?",
    a: "Data kamu disimpan secara aman di server terenkripsi. Kami menggunakan Supabase dengan enkripsi data standar industri dan backup otomatis.",
  },
  {
    q: "Apakah KasirKu bisa dipakai offline?",
    a: "KasirKu memiliki mode offline untuk transaksi POS. Data akan tersinkronisasi secara otomatis saat koneksi internet kembali tersedia.",
  },
  {
    q: "Bagaimana cara membayar langganan?",
    a: "Pembayaran bisa dilakukan via transfer bank, QRIS, atau kartu kredit melalui gateway pembayaran yang tersedia di halaman billing.",
  },
  {
    q: "Apakah bisa digunakan di lebih dari satu perangkat?",
    a: "Ya, KasirKu berbasis web sehingga bisa diakses dari perangkat apa pun — laptop, tablet, maupun HP — selama terhubung ke internet.",
  },
  {
    q: "Bagaimana jika saya butuh bantuan?",
    a: "Kamu bisa menghubungi tim kami melalui halaman Kontak atau via WhatsApp di 081234556757. Kami siap membantu pada hari dan jam kerja.",
  },
  {
    q: "Apakah ada biaya setup atau biaya tersembunyi?",
    a: "Tidak ada biaya setup. Kamu hanya membayar sesuai paket langganan yang dipilih, tanpa biaya tambahan tersembunyi.",
  },
];

export default function FaqPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="mb-2 text-3xl font-bold text-zinc-900">Pertanyaan Umum (FAQ)</h1>
        <p className="mb-10 text-zinc-500">
          Temukan jawaban atas pertanyaan yang sering ditanyakan tentang KasirKu.
        </p>

        <div className="space-y-4">
          {FAQS.map((item, i) => (
            <div key={i} className="rounded-2xl border border-zinc-200 bg-white p-6">
              <p className="font-semibold text-zinc-900">{item.q}</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">{item.a}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl bg-brand-50 p-6 text-center">
          <p className="text-sm font-medium text-zinc-700">
            Tidak menemukan jawaban yang kamu cari?
          </p>
          <a
            href="/kontak"
            className="mt-2 inline-block rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Hubungi Kami
          </a>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
