import type { Metadata } from "next";
import Link from "next/link";
import FloatingWhatsApp from "@/components/floating-whatsapp";
import Logo from "@/components/logo";

export const metadata: Metadata = {
  title: "Bagaimana Kasir, Kalkulator HPP, dan Jurnal Saling Terhubung — KasirKu",
  description:
    "Panduan visual: bagaimana transaksi kasir, Kalkulator HPP, dan chart of accounts otomatis tercatat sebagai jurnal berimbang di KasirKu — tanpa perlu paham istilah akuntansi.",
};

type AccountGroup = {
  title: string;
  tone: "aset" | "kewajiban" | "modal" | "pendapatan" | "beban";
  normalBalance: string;
  desc: string;
  accounts: { code: string; name: string }[];
};

const TONE_CLASSES: Record<AccountGroup["tone"], { bg: string; border: string; text: string; badge: string }> = {
  aset: { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-700", badge: "bg-sky-100 text-sky-700" },
  kewajiban: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    badge: "bg-amber-100 text-amber-700",
  },
  modal: {
    bg: "bg-violet-50",
    border: "border-violet-200",
    text: "text-violet-700",
    badge: "bg-violet-100 text-violet-700",
  },
  pendapatan: {
    bg: "bg-brand-50",
    border: "border-brand-200",
    text: "text-brand-700",
    badge: "bg-brand-100 text-brand-700",
  },
  beban: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", badge: "bg-red-100 text-red-700" },
};

const ACCOUNT_GROUPS: AccountGroup[] = [
  {
    title: "Aset",
    tone: "aset",
    normalBalance: "Normal: Debit",
    desc: "Kekayaan/milik usaha. Debit = bertambah, Kredit = berkurang.",
    accounts: [
      { code: "1-001", name: "Kas & Bank" },
      { code: "1-100", name: "Piutang Usaha" },
      { code: "1-200", name: "Persediaan" },
      { code: "1-500", name: "Peralatan" },
      { code: "1-501", name: "Akumulasi Penyusutan" },
    ],
  },
  {
    title: "Kewajiban",
    tone: "kewajiban",
    normalBalance: "Normal: Kredit",
    desc: "Utang usaha ke pihak lain. Kredit = bertambah, Debit = berkurang.",
    accounts: [
      { code: "2-001", name: "Utang Dagang" },
      { code: "2-100", name: "Utang Gaji" },
      { code: "2-200", name: "PPN Keluaran (Utang Pajak)" },
    ],
  },
  {
    title: "Modal",
    tone: "modal",
    normalBalance: "Normal: Kredit",
    desc: "Hak pemilik atas usaha. Kredit = bertambah, Debit = berkurang (ditarik).",
    accounts: [
      { code: "3-001", name: "Modal Pemilik" },
      { code: "3-100", name: "Laba Ditahan" },
    ],
  },
  {
    title: "Pendapatan",
    tone: "pendapatan",
    normalBalance: "Normal: Kredit",
    desc: "Hasil penjualan. Kredit = bertambah (paling umum dipakai).",
    accounts: [
      { code: "4-001", name: "Pendapatan Penjualan" },
      { code: "4-002", name: "Pendapatan Tiket" },
      { code: "4-999", name: "Pendapatan Lain-lain" },
    ],
  },
  {
    title: "Beban",
    tone: "beban",
    normalBalance: "Normal: Debit",
    desc: "Biaya operasional. Debit = bertambah (paling umum dipakai).",
    accounts: [
      { code: "5-001", name: "Beban Pokok Penjualan (HPP)" },
      { code: "5-100", name: "Beban Gaji" },
      { code: "5-101…105", name: "Listrik, Sewa, Marketing, Perlengkapan, Penyusutan" },
      { code: "5-999", name: "Beban Lain-lain" },
    ],
  },
];

function FlowChip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-center text-xs font-semibold text-zinc-700 shadow-sm">
      {children}
    </div>
  );
}

function DownArrow() {
  return <div className="mx-auto text-lg text-zinc-300">↓</div>;
}

function PostingRow({
  side,
  account,
  amount,
  note,
}: {
  side: "debit" | "kredit";
  account: string;
  amount: string;
  note?: string;
}) {
  return (
    <tr className="border-b border-zinc-100 last:border-0">
      <td className="py-2 pr-3">
        <span
          className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            side === "debit" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {side === "debit" ? "Debit" : "Kredit"}
        </span>
        <span className="text-zinc-700">{account}</span>
        {note && <span className="ml-1 text-zinc-400">— {note}</span>}
      </td>
      <td className="py-2 text-right font-mono text-zinc-800">{amount}</td>
    </tr>
  );
}

export default function PanduanAkuntansiPage() {
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

      {/* Hero */}
      <section className="bg-zinc-50 px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            Panduan
          </span>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-zinc-900 sm:text-4xl">
            Bagaimana Kasir, Kalkulator HPP, dan Jurnal Saling Terhubung
          </h1>
          <p className="mt-4 text-sm text-zinc-600 sm:text-base">
            Setiap kali ada transaksi di kasir — jualan, beli bahan, bayar gaji — KasirKu
            otomatis mencatatnya ke pembukuan berimbang di belakang layar. Ini penjelasannya,
            tanpa perlu latar belakang akuntansi.
          </p>
        </div>
      </section>

      {/* Gambaran besar */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xl font-bold text-zinc-900">Gambaran Besar</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Semua aktivitas bermuara ke satu tempat: Jurnal (buku besar). Dari situ, semua
            laporan keuangan dihitung ulang secara otomatis.
          </p>

          <div className="mt-8 space-y-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <FlowChip>🧾 Jual / Void</FlowChip>
              <FlowChip>📦 Pembelian</FlowChip>
              <FlowChip>💵 Beban</FlowChip>
              <FlowChip>🧑‍💼 Payroll</FlowChip>
              <FlowChip>✍️ Jurnal Manual</FlowChip>
            </div>
            <DownArrow />
            <div className="rounded-2xl bg-brand-600 px-4 py-4 text-center text-sm font-bold text-white shadow-md shadow-brand-600/20">
              Jurnal (Buku Besar) — setiap entri wajib Debit = Kredit
            </div>
            <DownArrow />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <FlowChip>⚖️ Neraca</FlowChip>
              <FlowChip>📈 Laba Rugi</FlowChip>
              <FlowChip>💧 Arus Kas</FlowChip>
              <FlowChip>💰 Kas Harian</FlowChip>
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-zinc-400">
            Semua sumber transaksi menulis ke Jurnal yang sama — laporan hanya &quot;membaca
            ulang&quot; jurnal itu dengan cara berbeda-beda.
          </p>
        </div>
      </section>

      {/* Peta Akun */}
      <section className="bg-zinc-50 px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-xl font-bold text-zinc-900">Peta Akun (Daftar Akun)</h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-500">
            Setiap akun punya &quot;sisi normal&quot; — sisi yang bikin saldonya{" "}
            <b>bertambah</b>. Kalau diisi di sisi sebaliknya, saldonya <b>berkurang</b>.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ACCOUNT_GROUPS.map((g) => {
              const tone = TONE_CLASSES[g.tone];
              return (
                <div key={g.title} className={`rounded-2xl border ${tone.border} ${tone.bg} p-5`}>
                  <div className="flex items-center justify-between">
                    <p className={`text-sm font-bold ${tone.text}`}>{g.title}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${tone.badge}`}>
                      {g.normalBalance}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">{g.desc}</p>
                  <div className="mt-3 space-y-1 border-t border-black/5 pt-3">
                    {g.accounts.map((a) => (
                      <div key={a.code} className="flex justify-between text-xs">
                        <span className="font-mono text-zinc-400">{a.code}</span>
                        <span className="text-right text-zinc-700">{a.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Kalkulator HPP */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xl font-bold text-zinc-900">🧮 Kalkulator HPP → Biaya Resep → Jurnal Otomatis</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Kalkulator HPP bukan sekadar alat hitung terpisah — hasilnya langsung dipakai sistem
            pembukuan setiap kali produk itu terjual.
          </p>
          <div className="mt-6 space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <FlowChip>🧮 Hitung HPP resep (Kalkulator HPP)</FlowChip>
              <FlowChip>📋 Biaya tersimpan di produk</FlowChip>
              <FlowChip>🧾 Produk terjual di kasir</FlowChip>
            </div>
            <DownArrow />
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-zinc-900">Jurnal otomatis saat terjual</p>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  <PostingRow side="debit" account="5-001 Beban Pokok Penjualan (HPP)" amount="sesuai hasil kalkulator" />
                  <PostingRow side="kredit" account="1-200 Persediaan" amount="sesuai hasil kalkulator" />
                </tbody>
              </table>
              <p className="mt-3 text-xs text-zinc-400">
                Kalau HPP produk belum dihitung (cost = Rp0), baris ini tidak ikut ter-posting —
                laba kotor jadi tidak akurat. Coba{" "}
                <Link href="/kalkulator-hpp" className="font-semibold text-brand-700 hover:underline">
                  Kalkulator HPP
                </Link>{" "}
                dulu untuk tiap produk baru.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Transaksi POS -> Jurnal */}
      <section className="bg-zinc-50 px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xl font-bold text-zinc-900">Transaksi POS → Jurnal Otomatis</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Setiap kali kasir menekan tombol, sistem sudah menyusun jurnal berimbang (Debit =
            Kredit) di belakang layar — tanpa kamu sentuh Akuntansi sama sekali.
          </p>

          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-zinc-900">🧾 Jual di Kasir</p>
              <p className="mt-1 text-xs text-zinc-500">
                Contoh: jual Kopi Susu Rp18.000, sudah termasuk PPN 10%.
              </p>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  <PostingRow side="debit" account="1-001 Kas & Bank" amount="Rp18.000" />
                  <PostingRow side="kredit" account="4-001 Pendapatan Penjualan" amount="Rp16.364" />
                  <PostingRow side="kredit" account="2-200 PPN Keluaran" amount="Rp1.636" />
                  <PostingRow side="debit" account="5-001 Beban Pokok Penjualan" amount="sesuai HPP" note="kalau resep ada biayanya" />
                  <PostingRow side="kredit" account="1-200 Persediaan" amount="sesuai HPP" />
                </tbody>
              </table>
              <p className="mt-3 text-xs text-zinc-400">
                PPN sengaja dipisah — itu bukan pendapatan usaha, tapi titipan pajak yang nanti
                disetor ke negara.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-zinc-900">↩️ Void Transaksi</p>
              <p className="mt-1 text-xs text-zinc-500">
                Manajer batalkan transaksi — sistem posting jurnal terbalik dari penjualan
                aslinya, stok &amp; bahan baku juga otomatis dikembalikan.
              </p>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  <PostingRow side="kredit" account="1-001 Kas & Bank" amount="(Rp18.000)" />
                  <PostingRow side="debit" account="4-001 Pendapatan Penjualan" amount="(Rp16.364)" />
                  <PostingRow side="debit" account="2-200 PPN Keluaran" amount="(Rp1.636)" />
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-zinc-900">📦 Beli Bahan Baku (Pembelian)</p>
              <p className="mt-1 text-xs text-zinc-500">Contoh: beli Rp105.000 bahan, bayar tunai langsung.</p>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  <PostingRow side="debit" account="1-200 Persediaan" amount="Rp105.000" />
                  <PostingRow
                    side="kredit"
                    account="1-001 Kas & Bank (lunas) / 2-001 Utang Dagang (kredit)"
                    amount="Rp105.000"
                  />
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-zinc-900">💵 Catat Beban / Bayar Gaji</p>
              <p className="mt-1 text-xs text-zinc-500">
                Pola yang sama untuk Keuangan (beban) maupun Payroll (gaji) — beban bertambah,
                kas berkurang.
              </p>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  <PostingRow side="debit" account="5-xxx Beban / 5-100 Beban Gaji" amount="Rp…" />
                  <PostingRow side="kredit" account="1-001 Kas & Bank" amount="Rp…" />
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Jurnal Manual & Koreksi */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xl font-bold text-zinc-900">Jurnal Manual &amp; Koreksi</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Ini satu-satunya bagian yang kamu isi sendiri (misalnya setoran modal) — jadi
            satu-satunya tempat salah input bisa terjadi. Contoh nyata: salah catat
            &quot;Pembelian ATK&quot;.
          </p>

          <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-red-600">❌ Input Awal (Salah Arah)</p>
            <table className="mt-2 w-full text-sm">
              <tbody>
                <PostingRow
                  side="debit"
                  account="1-001 Kas & Bank"
                  amount="Rp105.000"
                  note="harusnya berkurang, ini malah menambah"
                />
                <PostingRow
                  side="kredit"
                  account="5-104 Beban Perlengkapan"
                  amount="Rp105.000"
                  note="harusnya bertambah, ini malah mengurangi"
                />
              </tbody>
            </table>

            <p className="mt-5 text-sm font-bold text-brand-700">
              ↩ Klik &quot;Koreksi&quot; — Sistem Bikin Ini Otomatis
            </p>
            <table className="mt-2 w-full text-sm">
              <tbody>
                <PostingRow side="kredit" account="1-001 Kas & Bank" amount="Rp105.000" />
                <PostingRow side="debit" account="5-104 Beban Perlengkapan" amount="Rp105.000" />
              </tbody>
            </table>

            <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50 p-4 text-xs leading-relaxed text-brand-800">
              <b>Penting:</b> input asli + koreksi = saling meniadakan (net Rp0). Kalau
              pembelian ATK itu memang benar-benar terjadi, kamu masih perlu posting{" "}
              <b>satu jurnal baru lagi</b> dengan arah yang benar (Debit Beban Perlengkapan /
              Kredit Kas &amp; Bank) — Koreksi hanya membatalkan yang salah, bukan
              menggantikannya dengan yang benar.
            </div>
          </div>
        </div>
      </section>

      {/* Cheat sheet */}
      <section className="bg-zinc-50 px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-xl font-bold text-zinc-900">Cara Cepat Tentukan Debit atau Kredit</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { title: "Aset (Kas, Persediaan, dst)", lines: ["Bertambah → Debit", "Berkurang → Kredit"], tone: "aset" as const },
              { title: "Kewajiban (Utang)", lines: ["Bertambah → Kredit", "Dibayar/berkurang → Debit"], tone: "kewajiban" as const },
              { title: "Modal", lines: ["Setoran/bertambah → Kredit", "Prive/ditarik → Debit"], tone: "modal" as const },
              { title: "Pendapatan", lines: ["Bertambah → Kredit (paling umum)"], tone: "pendapatan" as const },
              { title: "Beban", lines: ["Bertambah → Debit (paling umum)"], tone: "beban" as const },
            ].map((c) => {
              const tone = TONE_CLASSES[c.tone];
              return (
                <div key={c.title} className={`rounded-2xl border ${tone.border} ${tone.bg} p-4`}>
                  <p className={`text-xs font-bold ${tone.text}`}>{c.title}</p>
                  <div className="mt-2 space-y-1">
                    {c.lines.map((l) => (
                      <p key={l} className="font-mono text-[11px] text-zinc-700">
                        {l}
                      </p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-zinc-400">
            Petunjuk ini juga otomatis muncul di halaman Jurnal Transaksi setiap kali kamu pilih
            akun — tidak perlu dihafal.
          </p>
        </div>
      </section>

      {/* Dari Jurnal ke Laporan */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-xl font-bold text-zinc-900">Dari Jurnal ke Laporan</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Empat laporan ini semuanya membaca jurnal yang sama, hanya disusun ulang dengan
            sudut pandang berbeda.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-brand-700">Neraca</p>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                Saldo semua akun per tanggal tertentu. Aset harus selalu = Kewajiban + Modal.
              </p>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-brand-700">Laba Rugi</p>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                Total Pendapatan dikurangi Total Beban dalam satu periode.
              </p>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-brand-700">Arus Kas</p>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                Semua pergerakan akun Kas &amp; Bank, dikelompokkan Operasional/Investasi/Pendanaan.
              </p>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-brand-700">Kas Harian</p>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                Versi sederhana Arus Kas — total masuk/keluar hari ini, tanpa istilah akuntansi.
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
          <h2 className="text-3xl font-bold">Pembukuan yang Benar, Tanpa Perlu Jadi Akuntan</h2>
          <p className="mt-3 text-brand-50/80">
            Semua alur di atas berjalan otomatis begitu kamu pakai KasirKu — coba gratis
            sekarang.
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
            <Logo className="h-7 w-7" />
            <span className="text-sm font-semibold text-zinc-700">KasirKu</span>
          </div>
          <p className="text-xs text-zinc-400">© {year} KasirKu. Semua hak dilindungi.</p>
        </div>
      </footer>

      <FloatingWhatsApp message="Halo, saya mau tanya soal fitur akuntansi KasirKu." />
    </div>
  );
}
