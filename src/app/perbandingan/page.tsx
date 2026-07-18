import type { Metadata } from "next";
import Link from "next/link";
import { PLANS } from "@/lib/billing/plans";
import FloatingWhatsApp from "@/components/floating-whatsapp";

export const metadata: Metadata = {
  title: "KasirKu vs Majoo, Moka POS, Pawoon, Qasir — Bandingkan Aplikasi Kasir",
  description:
    "Bandingkan harga dan paket KasirKu dengan aplikasi kasir lain di Indonesia — Majoo, Moka POS, Pawoon, dan Qasir — sebelum memutuskan.",
};

type Competitor = {
  name: string;
  startingPrice: string;
  note: string;
};

// Harga bersumber dari halaman resmi/berita masing-masing per Juli 2026 —
// lihat catatan sumber di bawah tabel. Kompetitor bisa mengubah harga kapan
// saja, jadi ini bukan janji akurasi real-time.
const COMPETITORS: Competitor[] = [
  {
    name: "Majoo",
    startingPrice: "Rp249.000/bulan",
    note: "Modul tambahan (akuntansi, CRM, HR) dikenakan biaya add-on terpisah, mulai Rp499.000/bulan per modul.",
  },
  {
    name: "Moka POS",
    startingPrice: "Rp299.000/bulan",
    note: "Paket termahal di antara pemain besar untuk tier dasarnya.",
  },
  {
    name: "Pawoon",
    startingPrice: "Rp149.000/bulan",
    note: "Ada versi gratis dengan batas 7 transaksi/hari.",
  },
  {
    name: "Qasir",
    startingPrice: "Gratis (terbatas) / Pro mulai ±Rp700rb/tahun",
    note: "Versi gratis cocok untuk usaha sangat kecil, fitur lanjutan di paket Pro.",
  },
];

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export default function PerbandinganPage() {
  const year = new Date().getFullYear();
  const monthly = PLANS.find((p) => p.code === "monthly")!;
  const yearly = PLANS.find((p) => p.code === "yearly")!;
  const lifetime = PLANS.find((p) => p.code === "lifetime")!;
  const yearlyPerMonth = Math.round(yearly.price / 12);

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

      {/* Hero */}
      <section className="bg-zinc-50 px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            Perbandingan
          </span>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-zinc-900 sm:text-4xl">
            KasirKu vs Aplikasi Kasir Lain
          </h1>
          <p className="mt-4 text-sm text-zinc-600 sm:text-base">
            Sebelum memutuskan, bandingkan dulu harga dan cakupan paketnya. Semua angka di
            bawah bersumber dari halaman resmi/pemberitaan masing-masing per {year}.
          </p>
        </div>
      </section>

      {/* Tabel harga */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-xl font-bold text-zinc-900">Harga Mulai Dari</h2>
          <div className="mt-5 overflow-x-auto rounded-2xl border border-zinc-200">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-4 py-3 font-semibold text-zinc-500">Aplikasi</th>
                  <th className="px-4 py-3 font-semibold text-zinc-500">Harga Mulai</th>
                  <th className="px-4 py-3 font-semibold text-zinc-500">Catatan</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-brand-100 bg-brand-50/60">
                  <td className="px-4 py-4 font-bold text-brand-700">KasirKu</td>
                  <td className="px-4 py-4 font-bold text-brand-700">
                    {formatRupiah(monthly.price)}/bulan
                  </td>
                  <td className="px-4 py-4 text-zinc-600">
                    Kasir, stok/resep, laporan, akuntansi &amp; SDM sudah termasuk dalam satu
                    harga — tidak ada modul tambahan berbayar terpisah. Bayar tahunan{" "}
                    {formatRupiah(yearly.price)} (~{formatRupiah(yearlyPerMonth)}/bulan) atau
                    sekali bayar {formatRupiah(lifetime.price)} seterusnya.
                  </td>
                </tr>
                {COMPETITORS.map((c) => (
                  <tr key={c.name} className="border-b border-zinc-100 last:border-0">
                    <td className="px-4 py-4 font-semibold text-zinc-900">{c.name}</td>
                    <td className="px-4 py-4 text-zinc-700">{c.startingPrice}</td>
                    <td className="px-4 py-4 text-zinc-500">{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            Sumber: halaman harga resmi masing-masing aplikasi dan pemberitaan publik per{" "}
            {year}. Harga kompetitor dapat berubah sewaktu-waktu — cek situs resmi mereka untuk
            info terkini sebelum memutuskan.
          </p>
        </div>
      </section>

      {/* Diferensiasi */}
      <section className="bg-zinc-50 px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-xl font-bold text-zinc-900">Yang Membuat KasirKu Berbeda</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm font-bold text-zinc-900">Satu Harga, Bukan Modul Terpisah</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                Akuntansi dan SDM sudah termasuk di harga dasar. Beberapa aplikasi kasir
                mengenakan biaya add-on terpisah per modul untuk fitur setara.
              </p>
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm font-bold text-zinc-900">Dukung Tempat Wisata &amp; Tiket</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                Tiket bernomor, harga hari libur, member, dan check-in gate — kebutuhan kolam
                renang/wahana/event yang jarang jadi fokus utama aplikasi kasir F&amp;B/retail.
              </p>
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm font-bold text-zinc-900">Opsi Sekali Bayar</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                Selain langganan, ada paket {formatRupiah(lifetime.price)} sekali bayar untuk
                seterusnya — tanpa perlu bayar bulanan/tahunan terus-menerus.
              </p>
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-sm font-bold text-zinc-900">Harga Transparan di Muka</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                Semua paket dan harganya bisa dilihat langsung tanpa perlu mendaftar dulu — lihat{" "}
                <Link href="/#harga" className="font-semibold text-brand-700 hover:underline">
                  harga lengkap KasirKu
                </Link>
                .
              </p>
            </div>
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
          <h2 className="text-3xl font-bold">Coba Langsung, Bandingkan Sendiri</h2>
          <p className="mt-3 text-brand-50/80">
            Daftar gratis dan lihat sendiri apakah KasirKu cocok untuk tokomu — tanpa kartu
            kredit, tanpa komitmen.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-700 shadow-lg transition-colors hover:bg-brand-50"
          >
            Daftar Sekarang →
          </Link>
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

      <FloatingWhatsApp message="Halo, saya mau tanya soal KasirKu dibanding aplikasi kasir lain." />
    </div>
  );
}
