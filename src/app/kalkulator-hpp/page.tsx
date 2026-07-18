import type { Metadata } from "next";
import Link from "next/link";
import FloatingWhatsApp from "@/components/floating-whatsapp";
import { HppCalculator } from "./hpp-calculator";

export const metadata: Metadata = {
  title: "Kalkulator HPP Gratis — Hitung Harga Pokok Produksi | KasirKu",
  description:
    "Hitung HPP (Harga Pokok Penjualan) dan harga jual yang disarankan untuk produk F&B/retail-mu secara instan, gratis, tanpa perlu daftar.",
};

export default function KalkulatorHppPage() {
  const year = new Date().getFullYear();

  return (
    <div className="flex-1">
      <header className="sticky top-0 z-10 border-b border-zinc-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
              K
            </div>
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
            Kalkulator Gratis
          </span>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-zinc-900 sm:text-4xl">
            Kalkulator HPP — Hitung Harga Pokok Produksimu dalam Hitungan Detik
          </h1>
          <p className="mt-4 text-sm text-zinc-600 sm:text-base">
            Masukkan bahan dan biayanya, langsung tahu HPP per porsi dan harga jual yang disarankan.
            Gratis, tanpa perlu daftar.
          </p>
        </div>
      </section>

      <section className="px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <HppCalculator />
        </div>
      </section>

      <section className="relative overflow-hidden bg-zinc-50 px-4 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-xl font-bold text-zinc-900">Belum yakin cara hitungnya?</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Baca panduan lengkapnya di{" "}
            <Link href="/blog/cara-hitung-hpp-usaha-fnb" className="font-semibold text-brand-700 hover:underline">
              Cara Menghitung HPP untuk Usaha F&amp;B
            </Link>
            .
          </p>
        </div>
      </section>

      <footer className="border-t border-zinc-100 px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
              K
            </div>
            <span className="text-sm font-semibold text-zinc-700">KasirKu</span>
          </div>
          <p className="text-xs text-zinc-400">© {year} KasirKu. Semua hak dilindungi.</p>
        </div>
      </footer>

      <FloatingWhatsApp message="Halo, saya mau tanya soal Kalkulator HPP / KasirKu." />
    </div>
  );
}
