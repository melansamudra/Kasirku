"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/logo";

const APLIKASI_KASIR_LINKS = [
  { href: "/kasirku", icon: "🧾", label: "KasirKu", desc: "Ringkasan fitur aplikasi kasir" },
  { href: "/kasirku#harga", icon: "💰", label: "Harga", desc: "Paket bulanan, tahunan, sekali bayar" },
  { href: "/kalkulator-hpp", icon: "🧮", label: "Kalkulator HPP", desc: "Hitung harga pokok produk, gratis" },
  { href: "/sistem-akuntansi", icon: "📊", label: "Sistem Akuntansi", desc: "Akuntansi & SDM tanpa ganti kasir" },
  { href: "/perbandingan", icon: "⚖️", label: "Perbandingan", desc: "KasirKu vs aplikasi kasir lain" },
  { href: "/panduan-akuntansi", icon: "📖", label: "Panduan", desc: "Cara kerja kasir, HPP, dan jurnal" },
];

const OTHER_LINKS = [
  { href: "/layanan", label: "Layanan" },
  { href: "/blog", label: "Artikel" },
  { href: "/rekomendasi-alat", label: "Rekomendasi Alat" },
];

// Satu header dipakai di SEMUA halaman publik (portal, KasirKu, layanan,
// blog, dst) — sebelumnya tiap halaman punya header sendiri-sendiri dengan
// nav berbeda-beda, jadi berpindah antar halaman terasa seperti masuk ke
// situs lain. "Aplikasi Kasir" sengaja jadi satu dropdown (mirip pola
// "Feature" di Olsera) supaya banyak sub-halaman KasirKu tidak perlu masing-
// masing jadi item nav sendiri di level atas.
export default function SiteHeader() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-100 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <Logo className="h-9 w-9" />
          <span className="text-base font-bold text-zinc-900">CreateImpact</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <div
            className="relative"
            onMouseEnter={() => setDropdownOpen(true)}
            onMouseLeave={() => setDropdownOpen(false)}
          >
            <button
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              aria-expanded={dropdownOpen}
              className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors hover:bg-zinc-50 ${
                dropdownOpen ? "text-brand-600" : "text-zinc-600"
              }`}
            >
              Aplikasi Kasir
              <span
                aria-hidden
                className={`text-[10px] transition-transform ${dropdownOpen ? "rotate-180 text-brand-600" : ""}`}
              >
                ▾
              </span>
            </button>
            {dropdownOpen && (
              <div className="absolute left-0 top-full w-[560px] max-w-[calc(100vw-2rem)] pt-2">
                <div className="grid grid-cols-2 gap-1 rounded-2xl border border-zinc-200 bg-white p-3 shadow-xl">
                  {APLIKASI_KASIR_LINKS.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-brand-50"
                    >
                      <span className="mt-0.5 text-lg" aria-hidden>
                        {l.icon}
                      </span>
                      <span>
                        <p className="text-sm font-semibold text-zinc-900">{l.label}</p>
                        <p className="text-xs text-zinc-500">{l.desc}</p>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
          {OTHER_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-brand-600"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Mobile nav */}
          <div className="relative md:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-label="Buka menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600"
            >
              {mobileOpen ? "✕" : "☰"}
            </button>
            {mobileOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMobileOpen(false)} />
                {/* fixed + left-4/right-4 (bukan absolute+right-0 relatif ke
                    tombol hamburger) — supaya panel selalu pas di dalam layar
                    HP apa pun lebar tombolnya, tidak kepotong ke kiri. */}
                <div className="fixed left-4 right-4 top-[72px] z-30 max-h-[75vh] overflow-y-auto rounded-xl border border-zinc-200 bg-white py-2 shadow-lg">
                  <p className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                    Aplikasi Kasir
                  </p>
                  {APLIKASI_KASIR_LINKS.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setMobileOpen(false)}
                      className="block px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      {l.label}
                    </Link>
                  ))}
                  <div className="my-1 border-t border-zinc-100" />
                  {OTHER_LINKS.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setMobileOpen(false)}
                      className="block px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
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
  );
}
