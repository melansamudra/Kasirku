import type { Metadata } from "next";
import Link from "next/link";
import { PLANS } from "@/lib/billing/plans";
import { BILLING_CONTACT } from "@/lib/billing/config";
import FloatingWhatsApp from "@/components/floating-whatsapp";
import AccountingHeroPreview from "./hero-preview";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Sistem Akuntansi & SDM untuk Bisnis yang Sudah Punya Kasir Sendiri | KasirKu",
  description:
    "Sudah nyaman pakai kasir/POS sendiri? Tambahkan pembukuan double-entry, payroll, absensi, invoice, dan laporan keuangan yang rapi dari KasirKu — tanpa perlu ganti sistem kasir.",
};

const FEATURES = [
  {
    icon: "📖",
    title: "Jurnal & Neraca Otomatis",
    desc: "Pembukuan double-entry sungguhan — setiap transaksi tercatat seimbang, Neraca selalu update.",
  },
  {
    icon: "📈",
    title: "Laba Rugi Real-Time",
    desc: "Laporan laba rugi kas maupun akrual, Arus Kas, dan Target vs Aktual tanpa hitung manual.",
  },
  {
    icon: "🧾",
    title: "Invoice / Nota",
    desc: "Buat invoice untuk catering, event, atau pesanan khusus — DP, jatuh tempo, bisa langsung dicetak.",
  },
  {
    icon: "💵",
    title: "Payroll & Absensi",
    desc: "Gaji harian, absensi, dan slip gaji karyawan — termasuk staf yang tidak pegang kasir.",
  },
  {
    icon: "🔔",
    title: "Notifikasi Jatuh Tempo",
    desc: "Hutang, invoice belum lunas, kontrak karyawan, dan payroll yang butuh perhatian — satu tempat.",
  },
  {
    icon: "💰",
    title: "Kas Harian",
    desc: "Catat pemasukan/pengeluaran harian tanpa perlu paham istilah akuntansi — akurasinya tetap terjaga.",
  },
  {
    icon: "🏦",
    title: "Rekonsiliasi Rekening",
    desc: "Sandingkan penerimaan kasirmu dengan mutasi rekening bank, ketahuan selisih & biaya merchant.",
  },
  {
    icon: "🔒",
    title: "Tutup Buku",
    desc: "Kunci laba/rugi tiap periode ke Laba Ditahan — laporan periode lalu tidak berubah-ubah lagi.",
  },
];

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export default function SistemAkuntansiPage() {
  const financePlans = PLANS.filter((p) => p.family === "finance");

  return (
    <div className="flex-1">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden bg-zinc-50 px-4 py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-24 h-80 w-80 rounded-full bg-brand-200/50 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              Untuk Bisnis yang Sudah Punya Kasir Sendiri
            </span>
            <h1 className="mt-4 text-3xl font-bold leading-tight text-zinc-900 sm:text-5xl">
              Sistem Akuntansi &amp; SDM — Tanpa Perlu Ganti Kasir
            </h1>
            <p className="mt-4 max-w-lg text-sm text-zinc-600 sm:text-base">
              Sudah nyaman pakai kasir/POS sendiri? Tinggal tambahkan pembukuan double-entry,
              payroll, absensi, invoice, dan laporan keuangan yang rapi dari KasirKu — tanpa
              migrasi data penjualan, tanpa ganti sistem kasir yang sudah jalan.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/20 transition-all hover:bg-brand-700 hover:shadow-lg hover:shadow-brand-600/25"
              >
                Mulai Sekarang →
              </Link>
              <Link
                href="#harga"
                className="rounded-xl border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                Lihat Harga
              </Link>
            </div>
            <p className="mt-4 text-xs text-zinc-400">
              Cuma butuh kasir? Coba{" "}
              <Link href="/kalkulator-hpp" className="font-medium text-brand-600 hover:underline">
                Kalkulator HPP Desktop
              </Link>{" "}
              — atau lihat{" "}
              <Link href="/kasirku" className="font-medium text-brand-600 hover:underline">
                paket lengkap KasirKu
              </Link>{" "}
              kalau mau kasir + akuntansi sekaligus. Penasaran cara kerjanya?{" "}
              <Link href="/panduan-akuntansi" className="font-medium text-brand-600 hover:underline">
                Lihat panduan lengkapnya
              </Link>
              .
            </p>
          </div>

          <AccountingHeroPreview />
        </div>
      </section>

      {/* Fitur */}
      <section id="fitur" className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">
              Pembukuan lengkap, bukan cuma catatan kas
            </h2>
            <p className="mt-3 text-sm text-zinc-500">
              Sistem akuntansi double-entry yang sama dengan yang sudah dipakai ribuan toko di
              KasirKu — kali ini bisa dibeli terpisah dari kasirnya.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl bg-white shadow-sm p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-lg">
                  {f.icon}
                </div>
                <p className="mt-3 text-sm font-bold text-zinc-900">{f.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Harga */}
      <section id="harga" className="bg-zinc-50 px-4 py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">Harga Finance Only</h2>
          <p className="mt-3 text-sm text-zinc-500">
            Lebih murah dari paket lengkap karena tidak termasuk fitur Kasir/POS — cocok kalau
            kasirmu sudah ditangani sistem lain.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {financePlans.map((plan) => (
              <div key={plan.code} className="rounded-2xl border border-zinc-200 bg-white p-6 text-left">
                <p className="text-sm font-bold text-zinc-900">{plan.name}</p>
                <p className="mt-1 text-2xl font-bold text-brand-700">{formatRupiah(plan.price)}</p>
                <p className="text-xs text-zinc-400">
                  {plan.kind === "lifetime" ? "Sekali bayar, seterusnya" : `Setiap ${plan.periodDays} hari`}
                </p>
                <Link
                  href="/signup"
                  className="mt-5 block rounded-xl bg-brand-600 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                >
                  Pilih Paket Ini →
                </Link>
                <a
                  href={`https://wa.me/${BILLING_CONTACT.whatsapp}?text=${encodeURIComponent(
                    `Halo, saya tertarik paket ${plan.name} KasirKu (${formatRupiah(plan.price)}). Bisa dibantu?`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block rounded-xl py-2.5 text-center text-xs font-semibold text-zinc-500 transition-colors hover:bg-zinc-100"
                >
                  💬 Tanya dulu via WhatsApp
                </a>
              </div>
            ))}
          </div>
          <p className="mt-5 text-xs text-zinc-400">
            Setelah daftar, pilih paket &quot;Finance Only&quot; di halaman langganan — menu Kasir/Produk
            otomatis tersembunyi, cuma tersisa Akuntansi &amp; SDM.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-emerald-600 px-4 py-20 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div className="relative mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold">Rapikan pembukuanmu tanpa ganti kasir</h2>
          <p className="mt-3 text-brand-50/80">
            Daftar dan pilih paket Finance Only — mulai catat jurnal, payroll, dan laporan
            keuangan hari ini juga.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-700 shadow-lg transition-colors hover:bg-brand-50"
          >
            Daftar Sekarang →
          </Link>
        </div>
      </section>

      <SiteFooter />

      <FloatingWhatsApp message="Halo, saya mau tanya soal Sistem Akuntansi & SDM KasirKu." />
    </div>
  );
}
