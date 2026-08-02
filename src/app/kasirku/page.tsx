import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/billing/plans";
import { BILLING_CONTACT } from "@/lib/billing/config";
import FloatingWhatsApp from "@/components/floating-whatsapp";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import HeroPreview from "./hero-preview";
import AppScreens from "./app-screens";
import FinancialSection from "./financial-section";

export const metadata: Metadata = {
  title: "KasirKu — Aplikasi Kasir untuk F&B, Retail & Tempat Wisata",
  description:
    "Satu aplikasi kasir untuk seluruh operasional tokomu — transaksi harian, stok bahan baku, sampai laporan laba rugi, tanpa ribet catat manual.",
};

const BUSINESS_TYPES = [
  {
    emoji: "🍽️",
    title: "F&B",
    desc: "Restoran, kafe, warung — kasir cepat, resep & stok bahan otomatis, self-order QR di meja.",
  },
  {
    emoji: "🛒",
    title: "Retail",
    desc: "Toko kelontong, fashion, elektronik — kelola stok, pelanggan, dan laporan penjualan.",
  },
  {
    emoji: "🎟️",
    title: "Tempat Wisata",
    desc: "Kolam renang, wahana, event — tiket bernomor, member, harga hari libur, check-in gate.",
  },
];

const FEATURES = [
  {
    icon: "🧾",
    title: "Kasir & Struk Instan",
    desc: "Transaksi cepat, cetak atau kirim struk, dukung banyak metode pembayaran.",
  },
  {
    icon: "📦",
    title: "Stok & Resep Otomatis",
    desc: "Stok bahan baku berkurang otomatis sesuai resep setiap ada transaksi.",
  },
  {
    icon: "🪑",
    title: "Self-Order via QR",
    desc: "Pelanggan pesan langsung dari meja lewat scan QR, masuk ke antrian kasir.",
  },
  {
    icon: "📊",
    title: "Laporan Real-Time",
    desc: "Penjualan, laba rugi, dan arus kas selalu ter-update tanpa hitung manual.",
  },
  {
    icon: "🧑‍💼",
    title: "Kelola Kasir & Shift",
    desc: "PIN kasir per orang, buka/tutup shift, rekonsiliasi kas otomatis.",
  },
  {
    icon: "💵",
    title: "Payroll & Absensi",
    desc: "Gaji harian, absensi, dan slip gaji karyawan dalam satu tempat.",
  },
  {
    icon: "👥",
    title: "Data Pelanggan & Member",
    desc: "Riwayat pembelian, kartu member, dan harga khusus pelanggan tetap.",
  },
  {
    icon: "🔒",
    title: "Aman & Multi-Toko",
    desc: "Setiap toko terisolasi datanya, kelola beberapa cabang dari satu akun.",
  },
  {
    icon: "📉",
    title: "Kontrol Biaya",
    desc: "Pantau budget vs aktual tiap kategori biaya — tahu mana yang boros.",
  },
  {
    icon: "🏦",
    title: "Finance & Akuntansi",
    desc: "Laba rugi, arus kas, dan neraca otomatis — tanpa perlu akuntan manual.",
  },
  {
    icon: "🧮",
    title: "Kalkulator HPP",
    desc: "Hitung harga pokok per produk, margin tiap menu, dan rekomendasi harga jual.",
  },
];

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

const playfairStyle = { fontFamily: "var(--font-playfair), Georgia, serif" };

export default async function KasirkuPage() {
  const fullPlans = PLANS.filter((p) => p.family === "full");
  const starterPlans = PLANS.filter((p) => p.family === "starter");
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex-1">
      <SiteHeader />

      {/* Banner Kalkulator HPP */}
      <Link
        href="/kalkulator-hpp"
        className="block border-b border-amber-100 bg-gradient-to-r from-amber-50 via-brand-50 to-amber-50 px-4 py-3 text-center transition-colors hover:from-amber-100 hover:to-amber-100"
      >
        <span className="text-sm font-semibold text-zinc-700">
          🧮 Baru: <span className="text-brand-700">Kalkulator HPP Gratis</span> — cek harga pokok
          produkmu dalam hitungan detik <span aria-hidden>→</span>
        </span>
      </Link>

      {/* Hero */}
      <section className="relative overflow-hidden bg-white px-4 py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-24 h-80 w-80 rounded-full bg-brand-100/60 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl"
        />

        <div className="relative mx-auto max-w-6xl">
          {/* Eyebrow with decorative lines */}
          <div className="flex items-center justify-center gap-4">
            <div className="h-px w-12 bg-brand-300 sm:w-20" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-600">
              Sistem Kasir Modern untuk F&amp;B
            </span>
            <div className="h-px w-12 bg-brand-300 sm:w-20" />
          </div>

          {/* Headline */}
          <h1
            className="mx-auto mt-5 max-w-3xl text-center text-4xl font-bold leading-tight text-zinc-900 sm:text-5xl lg:text-6xl"
            style={playfairStyle}
          >
            Tumbuh bersama{" "}
            <em className="text-brand-600" style={{ fontStyle: "italic" }}>
              bisnis F&amp;B
            </em>{" "}
            Anda.
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-center text-base leading-relaxed text-zinc-500">
            Dari warung kopi hingga restoran — KasirKu menjaga setiap transaksi, setiap struk,
            setiap rupiah. Bekerja offline penuh, laporan real-time.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/signup"
              className="rounded-xl bg-brand-600 px-7 py-3.5 text-sm font-semibold text-white shadow-md shadow-brand-600/20 transition-all hover:bg-brand-700 hover:shadow-lg hover:shadow-brand-600/25"
            >
              Coba 14 Hari Gratis
            </Link>
            <Link
              href="#fitur"
              className="rounded-xl border border-zinc-200 bg-white px-7 py-3.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              Pelajari Lebih Lanjut
            </Link>
          </div>

          <p className="mt-4 text-center text-xs text-zinc-400">
            Mulai dari{" "}
            <Link href="#harga" className="font-semibold text-brand-700 hover:underline">
              Rp299.000/bulan
            </Link>{" "}
            — tanpa kartu kredit untuk mendaftar.
          </p>

          {/* Hero preview */}
          <div className="mt-16 flex justify-center">
            <div className="w-full max-w-sm">
              <HeroPreview />
            </div>
          </div>
        </div>
      </section>

      {/* Jenis usaha */}
      <section className="bg-brand-50/50 px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl" style={playfairStyle}>
              Dibuat untuk jenis usahamu
            </h2>
            <p className="mt-3 text-sm text-zinc-500">
              Satu aplikasi, alur kerja yang disesuaikan untuk tiap jenis usaha.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {BUSINESS_TYPES.map((b) => (
              <div
                key={b.title}
                className="rounded-xl border border-brand-100 bg-white p-6 shadow-sm transition-shadow hover:border-brand-200 hover:shadow-md"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-2xl">
                  {b.emoji}
                </div>
                <p className="mt-4 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                  {b.title}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Fitur — horizontal scroll */}
      <section id="fitur" className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl" style={playfairStyle}>
              Semua yang kamu butuhkan, dalam satu aplikasi
            </h2>
            <p className="mt-3 text-sm text-zinc-500">
              Tidak perlu pakai banyak aplikasi terpisah untuk kasir, stok, laporan, dan keuangan.
            </p>
          </div>

          <div
            className="mt-10 flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6"
            style={{
              scrollSnapType: "x mandatory",
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "thin",
              scrollbarColor: "#57ce9c #e6f9f0",
            }}
          >
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="w-52 flex-none rounded-xl border-t-[3px] border-brand-500 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                style={{ scrollSnapAlign: "start" }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-lg">
                  {f.icon}
                </div>
                <p className="mt-3 text-sm font-bold text-zinc-900">{f.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{f.desc}</p>
              </div>
            ))}
            <div className="w-4 flex-none" aria-hidden />
          </div>
        </div>
      </section>

      {/* App Preview */}
      <section className="bg-zinc-50 px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-xl text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-600">
              Tampilan Aplikasi
            </span>
            <h2
              className="mt-3 text-2xl font-bold text-zinc-900 sm:text-3xl"
              style={playfairStyle}
            >
              Semua tersedia dalam satu dashboard
            </h2>
            <p className="mt-3 text-sm text-zinc-500">
              Kasir, laporan, keuangan, dan HPP — satu tempat, satu login.
            </p>
          </div>
          <div className="mt-10">
            <AppScreens />
          </div>
        </div>
      </section>

      {/* Modul Keuangan */}
      <FinancialSection />

      {/* Harga */}
      <section id="harga" className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl" style={playfairStyle}>
              Harga Transparan, Tanpa Biaya Tersembunyi
            </h2>
            <p className="mt-3 text-sm text-zinc-500">
              Mulai dari yang kamu butuhkan sekarang — upgrade kapan saja.
            </p>
          </div>

          {/* Paket Starter */}
          <div className="mt-12">
            <div className="mb-4 flex items-center gap-3">
              <p className="text-sm font-bold text-zinc-900">Paket Starter</p>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700">Low Budget</span>
            </div>
            <p className="mb-5 text-xs text-zinc-500">
              Kasir + pantau bahan baku (COGS) + laporan penjualan. Cukup untuk mulai berjualan rapi.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
              {starterPlans.map((plan) => {
                const isYearly = plan.code === "starter_yearly";
                return (
                  <div
                    key={plan.code}
                    className={`relative rounded-2xl border p-5 text-left ${
                      isYearly
                        ? "border-amber-400 bg-white shadow-md shadow-amber-400/10"
                        : "border-zinc-200 bg-white"
                    }`}
                  >
                    {isYearly && (
                      <span className="absolute -top-3 left-5 rounded-full bg-amber-500 px-3 py-1 text-[10px] font-semibold text-white">
                        Hemat ~24%
                      </span>
                    )}
                    <p className="text-sm font-bold text-zinc-900">{plan.name}</p>
                    <p className="mt-1 text-2xl font-bold text-amber-600">{formatRupiah(plan.price)}</p>
                    <p className="text-xs text-zinc-400">
                      {isYearly ? "Setiap 365 hari" : "Setiap 30 hari"}
                    </p>
                    <ul className="mt-3 space-y-1 text-xs text-zinc-600">
                      <li>✓ POS & kasir</li>
                      <li>✓ Bahan baku & resep (COGS)</li>
                      <li>✓ Laporan penjualan</li>
                      <li>✓ Kalkulator HPP</li>
                      <li className="text-zinc-400">✗ Akuntansi & SDM</li>
                    </ul>
                    <Link
                      href="/signup"
                      className={`mt-4 block rounded-xl py-2.5 text-center text-sm font-semibold transition-colors ${
                        isYearly
                          ? "bg-amber-500 text-white hover:bg-amber-600"
                          : "border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                      }`}
                    >
                      Pilih Paket Ini →
                    </Link>
                    <a
                      href={`https://wa.me/${BILLING_CONTACT.whatsapp}?text=${encodeURIComponent(
                        `Halo, saya tertarik paket ${plan.name} KasirKu (${formatRupiah(plan.price)}). Bisa dibantu?`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 block rounded-xl py-2 text-center text-xs font-semibold text-zinc-500 transition-colors hover:bg-zinc-100"
                    >
                      💬 Tanya via WhatsApp
                    </a>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="my-12 flex items-center gap-4">
            <div className="h-px flex-1 bg-zinc-100" />
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">atau pilih paket lengkap</p>
            <div className="h-px flex-1 bg-zinc-100" />
          </div>

          {/* Paket Lengkap */}
          <div className="mb-4">
            <p className="text-sm font-bold text-zinc-900">Paket Lengkap</p>
            <p className="mt-1 text-xs text-zinc-500">POS + Akuntansi + SDM — semua dalam satu aplikasi.</p>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            {fullPlans.map((plan) => {
              const isYearly = plan.code === "yearly";
              return (
                <div
                  key={plan.code}
                  className={`relative rounded-2xl border p-6 text-left ${
                    isYearly
                      ? "border-brand-500 bg-white shadow-lg shadow-brand-600/10"
                      : "border-zinc-200 bg-white"
                  }`}
                >
                  {isYearly && (
                    <span className="absolute -top-3 left-6 rounded-full bg-brand-600 px-3 py-1 text-[10px] font-semibold text-white">
                      Paling Hemat — ~31%
                    </span>
                  )}
                  <p className="text-sm font-bold text-zinc-900">{plan.name}</p>
                  {plan.kind === "lifetime" ? (
                    <p className="mt-1 text-xl font-bold text-brand-700">Harga Spesial</p>
                  ) : (
                    <p className="mt-1 text-3xl font-bold text-brand-700">{formatRupiah(plan.price)}</p>
                  )}
                  <p className="text-xs text-zinc-400">
                    {plan.kind === "lifetime"
                      ? "Sekali bayar, seterusnya — hubungi kami"
                      : `Setiap ${plan.periodDays} hari`}
                  </p>
                  {plan.kind === "lifetime" ? (
                    <a
                      href={`https://wa.me/${BILLING_CONTACT.whatsapp}?text=${encodeURIComponent(
                        `Halo, saya ingin tahu harga paket Sekali Bayar (Lifetime) KasirKu. Bisa dibantu?`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-5 block rounded-xl bg-brand-600 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                    >
                      💬 Hubungi Kami
                    </a>
                  ) : (
                    <>
                      <Link
                        href="/signup"
                        className={`mt-5 block rounded-xl py-2.5 text-center text-sm font-semibold transition-colors ${
                          isYearly
                            ? "bg-brand-600 text-white hover:bg-brand-700"
                            : "border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                        }`}
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
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-center text-xs text-zinc-400">
            Cuma butuh akuntansi &amp; SDM tanpa kasir? Lihat{" "}
            <Link href="/sistem-akuntansi#harga" className="font-medium text-brand-600 hover:underline">
              harga Finance Only
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Download APK */}
      <section id="download" className="bg-zinc-900 px-4 py-16 text-white">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Tersedia untuk Android</p>
          <h2 className="mt-3 text-2xl font-bold sm:text-3xl" style={playfairStyle}>
            Kasir di Genggamanmu
          </h2>
          <p className="mt-3 text-sm text-zinc-400">
            Unduh aplikasi KasirKu langsung ke smartphone Android — tidak perlu buka browser lagi.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href="/kasirku.apk"
              download="KasirKu.apk"
              className="flex items-center gap-3 rounded-2xl bg-white px-7 py-3.5 text-sm font-bold text-zinc-900 shadow-lg transition-colors hover:bg-zinc-100"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download APK Android
            </a>
          </div>
          <p className="mt-5 text-xs text-zinc-500">
            Gratis selama uji coba · Kompatibel Android 8.0+ · Izinkan install dari sumber tidak dikenal di pengaturan HP
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-600 px-4 py-20 text-white">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold" style={playfairStyle}>
            Siap kelola tokomu lebih rapi?
          </h2>
          <p className="mt-3 text-brand-50/80">
            Daftar gratis dan mulai pakai dalam hitungan menit — tanpa instalasi.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-700 shadow-lg transition-colors hover:bg-brand-50"
          >
            Mulai Gratis Sekarang →
          </Link>
        </div>
      </section>

      <SiteFooter />

      <FloatingWhatsApp />
    </div>
  );
}
