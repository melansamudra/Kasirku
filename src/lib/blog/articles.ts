export type ArticleBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

export type Article = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string; // ISO date
  content: ArticleBlock[];
};

export const ARTICLES: Article[] = [
  {
    slug: "cara-hitung-hpp-usaha-fnb",
    title: "Cara Menghitung HPP (Harga Pokok Penjualan) untuk Usaha F&B",
    description:
      "Panduan dasar menghitung HPP resep makanan/minuman supaya harga jual tidak rugi, lengkap contoh perhitungan.",
    publishedAt: "2026-07-12",
    content: [
      { type: "heading", text: "Apa itu HPP?" },
      {
        type: "paragraph",
        text: "HPP (Harga Pokok Penjualan) adalah total biaya bahan baku yang habis terpakai untuk menghasilkan satu porsi atau satu unit produk. Untuk usaha F&B, ini berarti menjumlahkan biaya semua bahan dalam satu resep, lalu membaginya dengan jumlah porsi yang dihasilkan.",
      },
      { type: "heading", text: "Kenapa HPP Penting" },
      {
        type: "paragraph",
        text: "Banyak pemilik warung/kafe menentukan harga jual berdasarkan perkiraan atau menyamakan harga kompetitor, tanpa tahu persis berapa modal sebenarnya. Akibatnya, produk yang terlihat laris belum tentu menguntungkan — bisa jadi malah menombok tanpa disadari, terutama kalau harga bahan baku naik tapi harga jual tidak pernah disesuaikan.",
      },
      { type: "heading", text: "Rumus Dasar Menghitung HPP" },
      {
        type: "paragraph",
        text: "HPP per porsi = Total biaya bahan baku dalam satu resep ÷ Jumlah porsi yang dihasilkan dari resep tersebut.",
      },
      { type: "heading", text: "Contoh Perhitungan: Nasi Goreng" },
      {
        type: "list",
        items: [
          "Nasi 1 porsi — Rp2.500",
          "Telur 1 butir — Rp2.000",
          "Ayam suwir 50gr — Rp4.000",
          "Bumbu & minyak — Rp1.500",
          "Total biaya bahan per porsi — Rp10.000",
        ],
      },
      {
        type: "paragraph",
        text: "Kalau target margin kotor 60%, harga jual minimal = HPP ÷ (1 − 0,6) = Rp10.000 ÷ 0,4 = Rp25.000. Di bawah harga itu, margin keuntungan mulai menipis atau bahkan rugi setelah dikurangi biaya operasional lain.",
      },
      { type: "heading", text: "Kesalahan Umum Saat Menghitung HPP" },
      {
        type: "list",
        items: [
          "Lupa memasukkan bahan pelengkap kecil (saus, kemasan, tisu) yang jumlahnya kelihatan sepele tapi terus berulang",
          "Tidak memperbarui HPP saat harga bahan baku di pasar naik",
          "Menghitung HPP sekali di awal buka usaha, lalu tidak pernah dihitung ulang",
          "Tidak memisahkan biaya bahan baku dari biaya operasional (gas, listrik, gaji) saat menentukan margin",
        ],
      },
      { type: "heading", text: "Menghitung Ulang HPP Secara Manual Itu Melelahkan" },
      {
        type: "paragraph",
        text: "Kalau punya puluhan menu dengan bahan yang saling tumpang tindih, menghitung ulang HPP satu-satu tiap kali harga bahan berubah jelas tidak praktis. Ini salah satu alasan KasirKu menghitung HPP setiap produk secara otomatis dari resepnya — begitu harga satu bahan baku diperbarui, semua produk yang memakai bahan itu ikut ter-update tanpa perlu dihitung manual lagi.",
      },
    ],
  },
  {
    slug: "cara-baca-laporan-laba-rugi-umkm",
    title: "Cara Membaca Laporan Laba Rugi untuk Pemilik UMKM (Tanpa Latar Belakang Akuntansi)",
    description:
      "Panduan sederhana memahami laporan laba rugi bagi pemilik usaha yang bukan lulusan akuntansi.",
    publishedAt: "2026-07-12",
    content: [
      { type: "heading", text: "Kenapa Laporan Laba Rugi Itu Penting" },
      {
        type: "paragraph",
        text: "Banyak pemilik usaha kecil menilai bisnisnya sehat cuma dari 'uang di laci kasir cukup atau tidak'. Padahal uang tunai yang ada bisa menyesatkan — omzet tinggi belum tentu untung, karena belum dikurangi biaya bahan, gaji, sewa, dan lainnya. Laporan laba rugi menjawab pertanyaan yang sebenarnya: dalam periode ini, usaha untung atau rugi, dan berapa besar.",
      },
      { type: "heading", text: "Bagian-bagian Utama Laporan Laba Rugi" },
      {
        type: "list",
        items: [
          "Pendapatan (Omzet) — total penjualan dalam periode tertentu, sebelum dikurangi apa pun",
          "HPP (Harga Pokok Penjualan) — biaya bahan baku dari semua produk yang terjual",
          "Laba Kotor — Pendapatan dikurangi HPP",
          "Biaya Operasional — gaji karyawan, sewa tempat, listrik, marketing, dan biaya rutin lainnya",
          "Laba Bersih — Laba Kotor dikurangi Biaya Operasional; inilah keuntungan sesungguhnya",
        ],
      },
      { type: "heading", text: "Contoh Sederhana" },
      {
        type: "list",
        items: [
          "Omzet sebulan — Rp30.000.000",
          "HPP (bahan baku terjual) — Rp12.000.000",
          "Laba Kotor — Rp18.000.000",
          "Biaya operasional (gaji, sewa, listrik) — Rp10.000.000",
          "Laba Bersih — Rp8.000.000",
        ],
      },
      {
        type: "paragraph",
        text: "Dari contoh di atas, omzet Rp30 juta terdengar besar, tapi keuntungan yang benar-benar masuk kantong hanya Rp8 juta — sekitar 27% dari omzet. Tanpa laporan ini, pemilik usaha mudah salah kira usahanya jauh lebih untung daripada kenyataannya.",
      },
      { type: "heading", text: "Tanda Bisnis Sehat vs Perlu Diwaspadai" },
      {
        type: "list",
        items: [
          "Sehat: Laba Kotor konsisten di atas 50–60% dari omzet (tergantung jenis usaha), dan Laba Bersih tetap positif tiap bulan",
          "Perlu diwaspadai: Laba Kotor menyusut dari bulan ke bulan meski omzet naik — biasanya tanda HPP naik tapi harga jual belum disesuaikan",
          "Perlu diwaspadai: Biaya operasional tumbuh lebih cepat dari omzet",
        ],
      },
      { type: "heading", text: "Laporan Manual vs Otomatis" },
      {
        type: "paragraph",
        text: "Menyusun laporan laba rugi manual dari nota dan catatan kasir sangat memakan waktu dan rawan salah hitung. KasirKu menyusun laporan laba rugi secara otomatis dari setiap transaksi kasir yang tercatat — pemilik usaha tinggal membaca angkanya, tanpa perlu rekap manual di akhir bulan.",
      },
    ],
  },
];

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
