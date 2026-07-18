import type { Metadata } from "next";
import { BILLING_CONTACT } from "@/lib/billing/config";
import FloatingWhatsApp from "@/components/floating-whatsapp";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Layanan Konsultasi Pajak Daerah & Review Biaya untuk F&B — CreateImpact",
  description:
    "Konsultasi pajak daerah (PB1/pajak restoran) dan review biaya/COGS untuk usaha F&B — dikerjakan langsung oleh tim CreateImpact.",
};

const SERVICES = [
  {
    icon: "🧾",
    title: "Konsultan Pajak Daerah (F&B)",
    tone: { bg: "bg-amber-50", border: "border-amber-200", icon: "bg-amber-100 text-amber-700" },
    desc:
      "Bantu usaha F&B memahami dan memenuhi kewajiban pajak daerah — pajak restoran/PB1, registrasi, dan perhitungan setoran bulanan — supaya tidak salah lapor atau kena denda.",
    scope: [
      "Registrasi & pendaftaran objek pajak daerah",
      "Perhitungan pajak restoran/PB1 bulanan",
      "Pendampingan pelaporan ke dinas pajak daerah",
      "Konsultasi kepatuhan pajak untuk usaha baru",
    ],
    note: "Bersifat konsultasi/edukasi & pendampingan administratif — bukan mewakili sengketa pajak formal.",
  },
  {
    icon: "📊",
    title: "Review Biaya & COGS",
    tone: { bg: "bg-sky-50", border: "border-sky-200", icon: "bg-sky-100 text-sky-700" },
    desc:
      "Analisis mendalam atas struktur biaya usahamu — harga pokok penjualan, beban operasional, dan efisiensi — untuk menemukan kebocoran biaya yang sering tidak terlihat sehari-hari.",
    scope: [
      "Review HPP/COGS per produk atau kategori",
      "Analisis beban operasional (gaji, sewa, listrik, dll)",
      "Identifikasi produk/kategori dengan margin tipis",
      "Rekomendasi efisiensi biaya yang bisa langsung dijalankan",
    ],
    note: "Ini review/analisis biaya internal, bukan audit laporan keuangan resmi berizin.",
  },
];

export default function LayananPage() {
  return (
    <div className="flex-1">
      <SiteHeader />

      {/* Hero */}
      <section className="bg-zinc-50 px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            Layanan Konsultasi
          </span>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-zinc-900 sm:text-4xl">
            Konsultasi Pajak Daerah &amp; Review Biaya untuk Usaha F&amp;B
          </h1>
          <p className="mt-4 text-sm text-zinc-600 sm:text-base">
            Bukan software — ini jasa yang dikerjakan langsung oleh tim kami, disesuaikan dengan
            kondisi usahamu.
          </p>
        </div>
      </section>

      {/* Layanan */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-4xl space-y-6">
          {SERVICES.map((s) => {
            const message = encodeURIComponent(`Halo, saya mau tanya soal layanan "${s.title}" CreateImpact.`);
            return (
              <div key={s.title} className={`rounded-2xl border ${s.tone.border} ${s.tone.bg} p-7`}>
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl ${s.tone.icon}`}>
                  {s.icon}
                </div>
                <h2 className="mt-4 text-xl font-bold text-zinc-900">{s.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{s.desc}</p>

                <ul className="mt-4 space-y-1.5">
                  {s.scope.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-zinc-700">
                      <span className="mt-0.5 text-brand-600">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-4 text-xs text-zinc-400">{s.note}</p>

                <a
                  href={`https://wa.me/${BILLING_CONTACT.whatsapp}?text=${message}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-block rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/20 transition-colors hover:bg-brand-700"
                >
                  💬 Konsultasi via WhatsApp
                </a>
              </div>
            );
          })}
        </div>
        <p className="mx-auto mt-6 max-w-4xl text-center text-xs text-zinc-400">
          Biaya layanan disesuaikan dengan skala dan kompleksitas usahamu — hubungi kami dulu
          untuk konsultasi awal tanpa biaya.
        </p>
      </section>

      <SiteFooter />

      <FloatingWhatsApp message="Halo, saya mau tanya soal layanan konsultasi CreateImpact." />
    </div>
  );
}
