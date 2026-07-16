import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HomeMobileNav from "./home-mobile-nav";
import HeroPreview from "./hero-preview";

const BUSINESS_TYPES = [
  {
    emoji: "🍽️",
    title: "F&B",
    desc: "Restoran, kafe, warung — kasir cepat, resep & stok bahan otomatis, self-order QR di meja.",
    icon: "bg-amber-50 text-amber-600",
    chip: "bg-amber-50 text-amber-700",
  },
  {
    emoji: "🛒",
    title: "Retail",
    desc: "Toko kelontong, fashion, elektronik — kelola stok, pelanggan, dan laporan penjualan.",
    icon: "bg-sky-50 text-sky-600",
    chip: "bg-sky-50 text-sky-700",
  },
  {
    emoji: "🎟️",
    title: "Tempat Wisata / Tiket",
    desc: "Kolam renang, wahana, event — tiket bernomor, member, harga hari libur, check-in gate.",
    icon: "bg-violet-50 text-violet-600",
    chip: "bg-violet-50 text-violet-700",
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
];

export default async function Home() {
  const supabase = await createClient();
  // getSession() (not getUser()) deliberately here — this only decides
  // whether to bounce an already-logged-in visitor off the marketing page
  // to /dashboard, a UX nicety with no real access-control stakes (the
  // dashboard itself is properly gated elsewhere with a validated getUser()
  // call). getSession() reads the cookie locally with no round-trip to
  // Supabase's Auth API, unlike getUser() — middleware.ts already does that
  // round-trip once per request to refresh the session, so calling getUser()
  // again here was a second redundant network hop on every homepage load.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect("/dashboard");
  }

  const year = new Date().getFullYear();

  return (
    <div className="flex-1">
      {/* Nav */}
      <header className="sticky top-0 z-10 border-b border-zinc-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
              K
            </div>
            <span className="text-base font-bold text-zinc-900">KasirKu</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/kalkulator-hpp"
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 sm:block"
            >
              Kalkulator HPP
            </Link>
            <Link
              href="/sistem-akuntansi"
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 sm:block"
            >
              Sistem Akuntansi
            </Link>
            <Link
              href="/blog"
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 md:block"
            >
              Artikel
            </Link>
            <Link
              href="/rekomendasi-alat"
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 md:block"
            >
              Rekomendasi Alat
            </Link>
            <HomeMobileNav />
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
            >
              Masuk
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/20 transition-colors hover:bg-brand-700"
            >
              Daftar Gratis
            </Link>
          </div>
        </div>
      </header>

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
      <section className="relative overflow-hidden bg-zinc-50 px-4 py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-24 h-80 w-80 rounded-full bg-brand-200/50 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 right-0 h-96 w-96 rounded-full bg-brand-300/30 blur-3xl"
        />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              Untuk F&amp;B, Retail &amp; Tempat Wisata
            </span>
            <h1 className="mt-4 text-4xl font-bold leading-tight text-zinc-900 sm:text-5xl">
              Satu aplikasi kasir untuk seluruh operasional tokomu
            </h1>
            <p className="mt-4 max-w-lg text-base text-zinc-600">
              Dari transaksi harian, stok bahan baku, sampai laporan laba rugi — kelola
              semuanya dalam satu tempat, tanpa ribet catat manual.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-brand-600/20 transition-all hover:bg-brand-700 hover:shadow-lg hover:shadow-brand-600/25"
              >
                Mulai Gratis →
              </Link>
              <Link
                href="#fitur"
                className="rounded-xl border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                Lihat Fitur
              </Link>
            </div>
          </div>

          <HeroPreview />
        </div>
      </section>

      {/* Jenis usaha */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">
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
                className="rounded-xl bg-white shadow-sm p-6 transition-shadow hover:shadow-md"
              >
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl ${b.icon}`}
                >
                  {b.emoji}
                </div>
                <p className={`mt-4 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${b.chip}`}>
                  {b.title}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Fitur */}
      <section id="fitur" className="bg-zinc-50 px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">
              Semua yang kamu butuhkan, dalam satu aplikasi
            </h2>
            <p className="mt-3 text-sm text-zinc-500">
              Tidak perlu pakai banyak aplikasi terpisah untuk kasir, stok, dan laporan.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl bg-white shadow-sm p-5"
              >
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

      {/* CTA */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-emerald-600 px-4 py-20 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div className="relative mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold">Siap kelola tokomu lebih rapi?</h2>
          <p className="mt-3 text-brand-50/80">
            Daftar gratis dan mulai pakai dalam hitungan menit — tanpa instalasi.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-700 shadow-lg transition-colors hover:bg-brand-50"
          >
            Daftar Sekarang →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-100 px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
              K
            </div>
            <span className="text-sm font-semibold text-zinc-700">KasirKu</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/kalkulator-hpp" className="text-xs text-zinc-400 hover:text-zinc-600 hover:underline">
              Kalkulator HPP
            </Link>
            <Link href="/sistem-akuntansi" className="text-xs text-zinc-400 hover:text-zinc-600 hover:underline">
              Sistem Akuntansi
            </Link>
            <Link href="/blog" className="text-xs text-zinc-400 hover:text-zinc-600 hover:underline">
              Artikel
            </Link>
            <Link href="/rekomendasi-alat" className="text-xs text-zinc-400 hover:text-zinc-600 hover:underline">
              Rekomendasi Alat
            </Link>
            <Link href="/terms" className="text-xs text-zinc-400 hover:text-zinc-600 hover:underline">
              Syarat &amp; Ketentuan
            </Link>
            <Link href="/privacy" className="text-xs text-zinc-400 hover:text-zinc-600 hover:underline">
              Kebijakan Privasi
            </Link>
          </div>
          <p className="text-xs text-zinc-400">© {year} KasirKu. Semua hak dilindungi.</p>
        </div>
      </footer>
    </div>
  );
}
