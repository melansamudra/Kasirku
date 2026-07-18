import type { Metadata } from "next";
import Link from "next/link";
import FloatingWhatsApp from "@/components/floating-whatsapp";
import { AFFILIATE_CATEGORIES } from "@/lib/affiliate/products";
import { AffiliateLink } from "./affiliate-link";
import Logo from "@/components/logo";

export const metadata: Metadata = {
  title: "Rekomendasi Alat Kasir & POS — KasirKu",
  description:
    "Pilihan printer struk, laci kas, barcode scanner, dan tablet stand yang cocok dipakai bersama KasirKu.",
};

export default function RekomendasiAlatPage() {
  const year = new Date().getFullYear();

  return (
    <div className="flex-1">
      <header className="sticky top-0 z-10 border-b border-zinc-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-9 w-9" />
            <span className="text-base font-bold text-zinc-900">KasirKu</span>
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/20 transition-colors hover:bg-brand-700"
          >
            Daftar Gratis
          </Link>
        </div>
      </header>

      <section className="bg-zinc-50 px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            Panduan Alat
          </span>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-zinc-900 sm:text-4xl">
            Rekomendasi Alat Kasir untuk Toko F&amp;B, Retail &amp; Tiket
          </h1>
          <p className="mt-4 text-sm text-zinc-600 sm:text-base">
            Alat pendukung yang paling sering dibutuhkan pengguna KasirKu — printer struk,
            barcode scanner, laci kas, sampai dudukan tablet. Link di bawah mengarah ke
            marketplace, bukan jualan langsung dari KasirKu.
          </p>
        </div>
      </section>

      <section className="px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 sm:grid-cols-2">
            {AFFILIATE_CATEGORIES.map((category) => (
              <div
                key={category.slug}
                className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-xl">
                    {category.icon}
                  </div>
                  <p className="text-base font-bold text-zinc-900">{category.title}</p>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-zinc-500">{category.desc}</p>

                <div className="mt-5 space-y-4">
                  {category.products.map((product) => (
                    <div
                      key={product.name}
                      className="rounded-xl bg-zinc-50 p-4"
                    >
                      <p className="text-sm font-semibold text-zinc-900">{product.name}</p>
                      <p className="mt-1 text-xs text-zinc-500">{product.reason}</p>
                      <AffiliateLink href={product.affiliateUrl} productName={product.name}>
                        Lihat di Marketplace →
                      </AffiliateLink>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-emerald-600 px-4 py-16 text-white">
        <div className="relative mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">Belum pakai KasirKu?</h2>
          <p className="mt-3 text-brand-50/80">
            Alat di atas paling optimal kalau dipakai bareng aplikasi kasir yang sudah terhubung
            ke stok, laporan, dan akuntansi tokomu.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-700 shadow-lg transition-colors hover:bg-brand-50"
          >
            Coba KasirKu Gratis →
          </Link>
        </div>
      </section>

      <footer className="border-t border-zinc-100 px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="text-sm font-semibold text-zinc-700">KasirKu</span>
          </div>
          <p className="text-xs text-zinc-400">© {year} KasirKu. Semua hak dilindungi.</p>
        </div>
      </footer>

      <FloatingWhatsApp />
    </div>
  );
}
