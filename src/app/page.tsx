import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FloatingWhatsApp from "@/components/floating-whatsapp";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import HeroPreview from "./kasirku/hero-preview";

export const metadata: Metadata = {
  title: "KasirKu — Aplikasi Kasir untuk F&B, Retail & Tempat Wisata",
  description:
    "Transaksi, stok bahan baku, dan laporan laba rugi — semua otomatis. Kasir offline-ready untuk warung, kafe, dan restoran Indonesia.",
};

const playfairStyle = { fontFamily: "var(--font-playfair), Georgia, serif" };

const STATS = [
  { value: "500+", label: "Toko aktif" },
  { value: "99.9%", label: "Uptime server" },
  { value: "Offline", label: "Tetap jalan tanpa WiFi" },
  { value: "Rp88rb", label: "Per bulan, semua fitur" },
];

const FEATURES = [
  {
    no: "01",
    title: "Kasir yang benar-benar cepat.",
    desc: "Tap produk, pilih metode bayar — selesai dalam hitungan detik. Struk bisa dicetak, dikirim WhatsApp, atau ditampilkan QR ke pelanggan. Tidak perlu keyboard, tidak perlu hitung kembalian manual.",
    tags: ["QRIS & Transfer", "Struk WhatsApp", "Split Bill", "Multi Kasir"],
  },
  {
    no: "02",
    title: "Stok berkurang sendiri setiap transaksi.",
    desc: "Setiap cup kopi yang terjual, biji kopi, susu, dan gelas langsung berkurang dari stok. Tidak ada input manual. Kamu tahu persis kapan harus beli bahan lagi — sebelum kehabisan di tengah jam ramai.",
    tags: ["Resep otomatis", "Alert stok habis", "Kelola bahan baku"],
  },
  {
    no: "03",
    title: "Laporan yang bisa langsung dibaca.",
    desc: "Buka dashboard, lihat penjualan hari ini, produk terlaris, dan laba bersih bulan ini — tanpa rekap Excel, tanpa hitung manual. Semua ter-update setiap ada transaksi, bisa diakses dari HP.",
    tags: ["Penjualan harian", "Laba rugi", "Arus kas", "HPP per produk"],
  },
];

const TESTIMONIALS = [
  {
    quote:
      "Sebelum pakai KasirKu, saya catat penjualan di buku tiap malam. Sekarang tinggal buka dashboard — semua sudah keliatan, termasuk margin per produk.",
    name: "Rina K.",
    biz: "Warung Kopi Semesta",
    loc: "Jakarta Selatan",
  },
  {
    quote:
      "Yang paling bantu itu fitur resep otomatis. Stok bahan baku langsung kepotong sendiri, jadi saya tahu persis sisa bahan tanpa ngitung manual setiap hari.",
    name: "Dedi S.",
    biz: "Ayam Bakar Pak De",
    loc: "Bandung",
  },
  {
    quote:
      "Waktu listrik mati pas weekend ramai, kasir tetap jalan offline. Begitu nyala lagi, semua data langsung sinkron. Itu yang bikin kami yakin pakai ini.",
    name: "Maya T.",
    biz: "Kafe Sore",
    loc: "Yogyakarta",
  },
];

function KasirMockup() {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
      <div className="flex items-center gap-1.5 border-b border-zinc-100 bg-zinc-50 px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-red-300" />
        <span className="h-2 w-2 rounded-full bg-amber-300" />
        <span className="h-2 w-2 rounded-full bg-emerald-300" />
        <span className="ml-2 text-xs font-semibold text-brand-600">KasirKu · Kasir</span>
      </div>
      <div className="grid grid-cols-2 gap-0">
        <div className="border-r border-zinc-100 p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Pilih Produk</p>
          <div className="grid grid-cols-2 gap-1.5">
            {[["Kopi Susu", "24k", true], ["Matcha Latte", "32k", false], ["Es Teh", "8k", false], ["Croissant", "22k", false], ["Roti Bakar", "18k", false], ["Pisang Goreng", "15k", false]].map(([n, p, sel]) => (
              <div key={String(n)} className={`rounded-lg border p-2 text-center ${sel ? "border-brand-300 bg-brand-50" : "border-zinc-100"}`}>
                <p className="truncate text-[9px] font-medium text-zinc-700">{n}</p>
                <p className="text-[8px] text-brand-600">{p}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Pesanan</p>
          <div className="space-y-1.5 rounded-xl bg-zinc-50 p-3">
            {[["Kopi Susu ×2", "Rp48.000"], ["Croissant ×1", "Rp22.000"]].map(([item, price]) => (
              <div key={String(item)} className="flex justify-between text-[9px]">
                <span className="text-zinc-500">{item}</span>
                <span className="font-semibold text-zinc-800">{price}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-zinc-200 pt-1.5 text-[9px] font-bold">
              <span className="text-zinc-900">Total</span>
              <span className="text-brand-700">Rp70.000</span>
            </div>
          </div>
          <div className="mt-2 rounded-xl bg-brand-600 py-2 text-center text-[11px] font-bold text-white">
            Bayar →
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1">
            {["Cash", "QRIS", "Transfer"].map((m) => (
              <div key={m} className="rounded border border-zinc-100 py-1 text-center text-[8px] text-zinc-400">{m}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StokMockup() {
  const items = [
    { name: "Biji Kopi Arabika", sat: "gram", stok: 2400, min: 500, ok: true },
    { name: "Susu Full Cream", sat: "ml", stok: 3200, min: 1000, ok: true },
    { name: "Gula Aren Cair", sat: "ml", stok: 380, min: 500, ok: false },
    { name: "Cup 16oz", sat: "pcs", stok: 145, min: 200, ok: false },
    { name: "Sedotan Kertas", sat: "pcs", stok: 800, min: 300, ok: true },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
      <div className="flex items-center gap-1.5 border-b border-zinc-100 bg-zinc-50 px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-red-300" />
        <span className="h-2 w-2 rounded-full bg-amber-300" />
        <span className="h-2 w-2 rounded-full bg-emerald-300" />
        <span className="ml-2 text-xs font-semibold text-brand-600">KasirKu · Stok Bahan Baku</span>
      </div>
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold text-zinc-900">Bahan Baku</p>
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">
            2 hampir habis
          </span>
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-100">
          <div className="grid grid-cols-[1fr_56px_56px_40px] bg-zinc-50 px-3 py-2">
            {["Bahan", "Stok", "Min.", ""].map((h, i) => (
              <p key={i} className="text-[9px] font-semibold text-zinc-400">{h}</p>
            ))}
          </div>
          {items.map((item) => (
            <div key={item.name} className={`grid grid-cols-[1fr_56px_56px_40px] items-center border-t border-zinc-50 px-3 py-2.5 ${!item.ok ? "bg-red-50/40" : ""}`}>
              <p className="text-[10px] font-medium text-zinc-700">{item.name}</p>
              <p className={`font-mono text-[10px] ${!item.ok ? "font-bold text-red-600" : "text-zinc-600"}`}>
                {item.stok.toLocaleString()}
              </p>
              <p className="font-mono text-[10px] text-zinc-400">{item.min.toLocaleString()}</p>
              <span className={`h-2 w-2 rounded-full ${item.ok ? "bg-brand-400" : "bg-red-400"}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const CHART = [42, 58, 51, 73, 62, 80, 68, 77, 55, 90, 72, 95];

function LaporanMockup() {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
      <div className="flex items-center gap-1.5 border-b border-zinc-100 bg-zinc-50 px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-red-300" />
        <span className="h-2 w-2 rounded-full bg-amber-300" />
        <span className="h-2 w-2 rounded-full bg-emerald-300" />
        <span className="ml-2 text-xs font-semibold text-brand-600">KasirKu · Dashboard</span>
      </div>
      <div className="p-4">
        <div className="mb-3 grid grid-cols-3 gap-2">
          {[
            { l: "Penjualan", v: "Rp18,4jt", s: "+8,2%", ok: true },
            { l: "Transaksi", v: "284", s: "Hari ini: 18", ok: true },
            { l: "Laba Bersih", v: "Rp2,9jt", s: "Margin 16%", ok: true },
          ].map((c) => (
            <div key={c.l} className="rounded-xl border border-zinc-100 bg-zinc-50 p-2.5">
              <p className="text-[8px] uppercase tracking-wide text-zinc-400">{c.l}</p>
              <p className="mt-0.5 text-sm font-bold text-zinc-900">{c.v}</p>
              <p className="text-[8px] text-brand-600">{c.s}</p>
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-zinc-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[9px] font-semibold text-zinc-500">Penjualan Agustus</p>
            <p className="text-[8px] text-brand-500">Rp18.400.000 total</p>
          </div>
          <div className="flex h-16 items-end gap-0.5">
            {CHART.map((h, i) => (
              <div
                key={i}
                className={`flex-1 rounded-t-sm ${i === CHART.length - 1 ? "bg-brand-500" : "bg-brand-200"}`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-zinc-100 p-2.5">
            <p className="text-[8px] text-zinc-400">Produk Terlaris</p>
            <p className="mt-0.5 text-[10px] font-bold text-zinc-800">Kopi Susu G. Aren</p>
            <p className="text-[8px] text-brand-600">48 porsi · Rp1,15jt</p>
          </div>
          <div className="rounded-xl border border-zinc-100 p-2.5">
            <p className="text-[8px] text-zinc-400">Jam Tersibuk</p>
            <p className="mt-0.5 text-[10px] font-bold text-zinc-800">08.00 – 09.00</p>
            <p className="text-[8px] text-brand-600">23 transaksi/jam</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const MOCKUPS = [KasirMockup, StokMockup, LaporanMockup];

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="flex-1">
      <SiteHeader />

      {/* Hero */}
      <section className="bg-white px-4 pb-20 pt-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid items-center gap-14 lg:grid-cols-[1fr_380px]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                F&amp;B · Retail · Tempat Wisata
              </p>
              <h1
                className="mt-4 text-4xl font-bold leading-[1.1] text-zinc-950 sm:text-5xl lg:text-[3.25rem]"
                style={playfairStyle}
              >
                Kamu fokus jualan.{" "}
                <span className="text-brand-600">KasirKu</span> yang urus
                sisanya.
              </h1>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-zinc-500">
                Transaksi, stok bahan baku, dan laporan laba rugi — semua berjalan otomatis.
                Kasir offline-ready untuk warung, kafe, dan restoran Indonesia.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/signup"
                  className="rounded-xl bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                >
                  Coba Gratis 14 Hari →
                </Link>
                <Link
                  href="/kasirku#fitur"
                  className="rounded-xl border border-zinc-200 px-6 py-3.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
                >
                  Lihat Semua Fitur
                </Link>
              </div>
              <p className="mt-4 text-xs text-zinc-400">
                Mulai dari Rp88.000/bulan — tidak perlu kartu kredit untuk daftar.
              </p>
            </div>
            <HeroPreview />
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-zinc-100 bg-zinc-50 px-4 py-10">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-2xl font-bold text-zinc-900 sm:text-3xl">{s.value}</p>
                <p className="mt-1 text-xs text-zinc-400">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 max-w-xl">
            <h2
              className="text-2xl font-bold text-zinc-900 sm:text-3xl"
              style={playfairStyle}
            >
              Dirancang untuk pemilik usaha, bukan akuntan.
            </h2>
            <p className="mt-3 text-zinc-500">
              Tidak perlu belajar software baru. Buka, langsung bisa dipakai.
            </p>
          </div>

          <div className="space-y-24">
            {FEATURES.map((f, i) => {
              const Mockup = MOCKUPS[i];
              const reversed = i % 2 === 1;
              return (
                <div
                  key={f.no}
                  className={`grid items-center gap-12 lg:grid-cols-2 ${reversed ? "lg:[&>*:first-child]:order-last" : ""}`}
                >
                  <div>
                    <p className="text-xs font-bold tracking-widest text-brand-500">{f.no}</p>
                    <h3
                      className="mt-2 text-2xl font-bold text-zinc-900"
                      style={playfairStyle}
                    >
                      {f.title}
                    </h3>
                    <p className="mt-4 leading-relaxed text-zinc-500">{f.desc}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {f.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Mockup />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-zinc-950 px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 max-w-lg">
            <h2
              className="text-2xl font-bold text-white sm:text-3xl"
              style={playfairStyle}
            >
              Dipakai sehari-hari oleh pemilik toko, bukan demo.
            </h2>
            <p className="mt-3 text-zinc-400">
              Cerita langsung dari yang sudah pakai.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
              >
                <p className="flex-1 text-sm leading-relaxed text-zinc-300">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-5 border-t border-zinc-800 pt-4">
                  <p className="text-sm font-semibold text-white">{t.name}</p>
                  <p className="text-xs text-zinc-500">
                    {t.biz} · {t.loc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Secondary services */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 max-w-md">
            <h2 className="text-xl font-bold text-zinc-900" style={playfairStyle}>
              Ada yang lain juga.
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              Selain kasir, kami juga bantu dari sisi konsultasi dan edukasi F&B.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/layanan"
              className="group rounded-2xl border border-zinc-200 p-6 transition-shadow hover:shadow-md"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">
                Layanan Konsultasi
              </p>
              <p className="mt-2 text-base font-bold text-zinc-900">
                Pajak Daerah & Review Biaya
              </p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                Bantu urus PB1/pajak restoran dan review COGS — dikerjakan langsung oleh tim kami.
              </p>
              <span className="mt-4 inline-block text-sm font-semibold text-brand-600 group-hover:underline">
                Lihat Layanan →
              </span>
            </Link>
            <Link
              href="/blog"
              className="group rounded-2xl border border-zinc-200 p-6 transition-shadow hover:shadow-md"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">
                Artikel &amp; Panduan
              </p>
              <p className="mt-2 text-base font-bold text-zinc-900">
                Operasional F&B, HPP, Laporan Keuangan
              </p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                Panduan gratis soal HPP, laba rugi, manajemen stok, dan topik operasional F&B lainnya.
              </p>
              <span className="mt-4 inline-block text-sm font-semibold text-brand-600 group-hover:underline">
                Baca Artikel →
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-600 px-4 py-20 text-white">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold" style={playfairStyle}>
            Siap coba tanpa risiko?
          </h2>
          <p className="mt-3 text-brand-100/80">
            14 hari gratis, semua fitur terbuka, tidak perlu kartu kredit.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
          >
            Mulai Sekarang, Gratis →
          </Link>
          <p className="mt-3 text-xs text-brand-100/60">
            Setelah 14 hari, mulai dari Rp88.000/bulan.
          </p>
        </div>
      </section>

      <SiteFooter />
      <FloatingWhatsApp message="Halo, saya mau tanya soal KasirKu." />
    </div>
  );
}
