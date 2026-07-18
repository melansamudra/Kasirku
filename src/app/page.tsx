import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FloatingWhatsApp from "@/components/floating-whatsapp";
import Logo from "@/components/logo";

export const metadata: Metadata = {
  title: "CreateImpact — Portal Bisnis Kuliner & F&B",
  description:
    "Aplikasi kasir, layanan konsultasi pajak daerah & review biaya, sampai panduan operasional untuk usaha F&B — semua dalam satu portal.",
};

const PILLARS = [
  {
    emoji: "🧾",
    title: "Aplikasi Kasir",
    name: "KasirKu",
    desc: "Kasir, stok & resep otomatis, laporan real-time, sampai akuntansi & payroll — satu aplikasi untuk operasional harian tokomu.",
    href: "/kasirku",
    cta: "Lihat KasirKu →",
    tone: { bg: "bg-brand-50", border: "border-brand-200", icon: "bg-brand-100 text-brand-700", text: "text-brand-700" },
  },
  {
    emoji: "📋",
    title: "Layanan Konsultasi",
    name: "Pajak Daerah & Review Biaya",
    desc: "Bantu urus pajak daerah (PB1/pajak restoran) dan review COGS/beban usahamu — dikerjakan langsung oleh tim kami, bukan software.",
    href: "/layanan",
    cta: "Lihat Layanan →",
    tone: { bg: "bg-amber-50", border: "border-amber-200", icon: "bg-amber-100 text-amber-700", text: "text-amber-700" },
  },
  {
    emoji: "📚",
    title: "Sumber Daya Gratis",
    name: "Artikel & Panduan F&B",
    desc: "Panduan HPP, laporan laba rugi, manajemen stok, dan topik operasional F&B lainnya — gratis dibaca siapa saja.",
    href: "/blog",
    cta: "Baca Artikel →",
    tone: { bg: "bg-sky-50", border: "border-sky-200", icon: "bg-sky-100 text-sky-700", text: "text-sky-700" },
  },
];

export default async function PortalHomePage() {
  const supabase = await createClient();
  // getSession() (not getUser()) deliberately here — this only decides
  // whether to bounce an already-logged-in visitor off the marketing page
  // to /dashboard, a UX nicety with no real access-control stakes (the
  // dashboard itself is properly gated elsewhere with a validated getUser()
  // call).
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect("/dashboard");
  }

  const year = new Date().getFullYear();

  return (
    <div className="flex-1">
      <header className="sticky top-0 z-10 border-b border-zinc-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-9 w-9" />
            <span className="text-base font-bold text-zinc-900">CreateImpact</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/kasirku"
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 sm:block"
            >
              Aplikasi Kasir
            </Link>
            <Link
              href="/layanan"
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 sm:block"
            >
              Layanan
            </Link>
            <Link
              href="/blog"
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 sm:block"
            >
              Artikel
            </Link>
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
        <div className="relative mx-auto max-w-3xl text-center">
          <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            Portal Bisnis Kuliner &amp; F&amp;B
          </span>
          <h1 className="mt-4 text-4xl font-bold leading-tight text-zinc-900 sm:text-5xl">
            Semua yang Dibutuhkan Usaha F&amp;B, dalam Satu Tempat
          </h1>
          <p className="mt-4 text-base text-zinc-600">
            Dari aplikasi kasir, layanan konsultasi pajak &amp; biaya, sampai panduan operasional
            — CreateImpact menemani usahamu dari hari pertama.
          </p>
        </div>
      </section>

      {/* Pilar */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 sm:grid-cols-3">
            {PILLARS.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className={`group flex flex-col rounded-2xl border ${p.tone.border} ${p.tone.bg} p-7 transition-shadow hover:shadow-lg`}
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl ${p.tone.icon}`}>
                  {p.emoji}
                </div>
                <p className={`mt-4 text-xs font-bold uppercase tracking-wide ${p.tone.text}`}>{p.title}</p>
                <p className="mt-1 text-lg font-bold text-zinc-900">{p.name}</p>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-600">{p.desc}</p>
                <span className={`mt-5 text-sm font-semibold ${p.tone.text} group-hover:underline`}>{p.cta}</span>
              </Link>
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
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div className="relative mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold">Belum Tahu Mulai dari Mana?</h2>
          <p className="mt-3 text-brand-50/80">
            Kalau usahamu sudah butuh kasir yang rapi, mulai dari KasirKu — gratis dicoba, tanpa
            kartu kredit.
          </p>
          <Link
            href="/kasirku"
            className="mt-8 inline-block rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-700 shadow-lg transition-colors hover:bg-brand-50"
          >
            Lihat Aplikasi Kasir →
          </Link>
        </div>
      </section>

      <footer className="border-t border-zinc-100 px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="text-sm font-semibold text-zinc-700">CreateImpact</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/kasirku" className="text-xs text-zinc-400 hover:text-zinc-600 hover:underline">
              Aplikasi Kasir
            </Link>
            <Link href="/layanan" className="text-xs text-zinc-400 hover:text-zinc-600 hover:underline">
              Layanan
            </Link>
            <Link href="/blog" className="text-xs text-zinc-400 hover:text-zinc-600 hover:underline">
              Artikel
            </Link>
            <Link href="/terms" className="text-xs text-zinc-400 hover:text-zinc-600 hover:underline">
              Syarat &amp; Ketentuan
            </Link>
            <Link href="/privacy" className="text-xs text-zinc-400 hover:text-zinc-600 hover:underline">
              Kebijakan Privasi
            </Link>
          </div>
          <p className="text-xs text-zinc-400">© {year} CreateImpact. Semua hak dilindungi.</p>
        </div>
      </footer>

      <FloatingWhatsApp message="Halo, saya mau tanya soal CreateImpact." />
    </div>
  );
}
