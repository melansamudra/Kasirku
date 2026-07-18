import type { Metadata } from "next";
import Link from "next/link";
import FloatingWhatsApp from "@/components/floating-whatsapp";
import { HppCalculator } from "./hpp-calculator";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Kalkulator HPP Gratis — Hitung Harga Pokok Produksi | KasirKu",
  description:
    "Hitung HPP (Harga Pokok Penjualan) dan harga jual yang disarankan untuk produk F&B/retail-mu secara instan, gratis, tanpa perlu daftar.",
};

export default function KalkulatorHppPage() {
  return (
    <div className="flex-1">
      <SiteHeader />

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

      <SiteFooter />

      <FloatingWhatsApp message="Halo, saya mau tanya soal Kalkulator HPP / KasirKu." />
    </div>
  );
}
