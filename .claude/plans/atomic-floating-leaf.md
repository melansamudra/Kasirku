# Kalkulator HPP — Aplikasi Desktop Sekali-Beli

## Context

Pivot dari rencana sebelumnya (kalkulator HPP berbasis web + AI, sudah dicabut total hari ini — lihat memory `kalkulator-hpp-standalone` yang sudah ditandai superseded). Tujuan baru user: jual sebagai **aplikasi desktop (installer .exe)**, **sekali bayar** (bukan langganan), **data tersimpan lokal di komputer pembeli** — begitu terjual, tidak ada beban server/biaya berjalan ke pemilik KasirKu. Pembayaran tetap lewat sistem Midtrans yang sudah ada (dibangun otomatis sekarang, aktif begitu akun Midtrans user lolos verifikasi — lihat memory `billing-midtrans`, saat ini `BILLING_MANUAL_MODE = true`).

**Prinsip desain kunci**: aplikasi desktop-nya sendiri (`desktop-app/`) 100% berdiri sendiri setelah di-download — tidak ada login, tidak ada panggilan ke server KasirKu, data disimpan sebagai file lokal di komputer pembeli (lewat `electron-store`). Yang TETAP butuh server KasirKu hanyalah bagian **jualan**: halaman beli, proses pembayaran Midtrans, dan pengiriman link download setelah bayar — persis pola yang sama dengan sistem billing bisnis yang sudah ada, tapi untuk pembeli tanpa akun (guest checkout by email, bukan business_id).

**Trade-off yang perlu diketahui user** (sudah disampaikan & diterima sebelumnya): karena file installer statis tanpa validasi lisensi online, pembeli bisa saja membagikan file itu ke orang lain — tidak ada DRM. Ini konsekuensi wajar dari "tanpa server setelah beli".

## Bagian 1 — Aplikasi Desktop (Electron, folder baru `desktop-app/`)

Proyek terpisah dari `src/` Next.js (package.json sendiri, tidak ikut ter-bundle ke web app) supaya tooling-nya tidak bentrok:
- `desktop-app/main.js` — proses utama Electron, buka satu `BrowserWindow` memuat `index.html`.
- `desktop-app/index.html` + `renderer.js` + `style.css` — **vanilla HTML/JS, bukan React/Vite** (sengaja disederhanakan — UI-nya cuma CRUD bahan baku + menu + resep + kalkulasi HPP/margin, tidak butuh framework berat, mengurangi risiko build gagal di lingkungan ini).
- Logika hitung HPP/margin **disalin dari** `src/app/kalkulator-hpp/hpp-calculator.tsx` (rumus `hpp/(1-margin)` yang sama, sudah terbukti benar) — diterjemahkan ke vanilla JS.
- Penyimpanan data lokal: `electron-store` (npm package kecil, simpan JSON di folder data user OS) untuk bahan baku, menu, resep — bukan `localStorage` (lebih tahan lama & lazim dipakai app desktop).
- Packaging: `electron-builder`, target `nsis` (installer Windows .exe) — cakupan v1 Windows saja (sesuai permintaan "installer .exe"; Mac/Linux nanti kalau diminta, butuh mesin Mac untuk code-sign).
- **Risiko yang perlu saya laporkan setelah dicoba, bukan diasumsikan berhasil**: build Electron mengunduh binary Electron (~100an MB) saat `npm install` — belum tentu lancar di sandbox ini. Saya akan coba jalankan build-nya dan laporkan hasilnya; kalau gagal/terblokir, kodenya tetap lengkap dan bisa di-build user sendiri di komputernya (`cd desktop-app && npm install && npm run dist`).

## Bagian 2 — Jualan & Pengiriman (extend sistem Midtrans yang sudah ada)

**Migrasi baru** — tabel terpisah dari `payments`/`subscriptions` (yang terikat `business_id`), karena ini pembelian tanpa akun:
- `public.hpp_desktop_orders` (id, order_id unique, email, amount, status, download_token uuid nullable, midtrans_transaction_id, payment_type, raw_notification jsonb, created_at, updated_at). RLS diaktifkan **tanpa policy publik sama sekali** — insert/update hanya lewat service-role client (`src/lib/supabase/service.ts`, sudah ada), bukan sesi user biasa (karena memang tidak ada sesi user di alur ini).
- `public.get_hpp_order_status(p_order_id text)` — RPC security-definer, return `(status text, download_token uuid)`; `download_token` cuma diisi kalau `status = 'settlement'`. Ini satu-satunya cara publik/anonim boleh mengecek status pesanan mereka sendiri (by order_id, bukan scan seluruh tabel).

**Katalog produk** — `src/lib/billing/desktop-products.ts`, terpisah dari `PLANS` bisnis yang sudah ada (`src/lib/billing/plans.ts`), satu entri: kode `kalkulator-hpp-desktop`, harga **placeholder Rp49.000** (sama pola dengan harga placeholder yang sudah ada di `plans.ts` — wajib diedit sebelum live, saya tidak tahu harga yang kamu mau).

**Halaman & Server Actions baru** (semua publik, tanpa login):
- `src/app/kalkulator-hpp/beli/page.tsx` — deskripsi produk + form email + tombol "Beli Sekarang".
- `src/app/kalkulator-hpp/beli/actions.ts` — `createDesktopOrder(email)`: validasi email, generate `order_id` (prefix `HPP-`, beda dari prefix `KK-` yang dipakai pembayaran bisnis supaya webhook bisa membedakan), insert baris `pending` via service-role client, panggil Midtrans Snap **persis pola `createPayment` di `billing/actions.ts`**. Menghormati `BILLING_MANUAL_MODE` yang sudah ada — kalau `true`, tampilkan kontak WhatsApp/email (`BILLING_CONTACT`) alih-alih mencoba Midtrans yang memang belum aktif.
- `src/app/kalkulator-hpp/beli/selesai/page.tsx` — halaman setelah kembali dari Midtrans (`callbacks.finish`), baca `order_id` dari query string, polling `get_hpp_order_status` tiap beberapa detik sampai `settlement` (mengantisipasi webhook belum sempat jalan), lalu tampilkan link download.

**Webhook** (`src/app/api/midtrans/notification/route.ts`) — extend, bukan ganti: cek prefix `order_id` di awal — kalau `HPP-`, proses ke `hpp_desktop_orders` (generate `download_token` baru saat status jadi `settlement`); kalau bukan (prefix `KK-` yang sudah ada), jalankan logic bisnis/subscription seperti sekarang, tidak berubah sama sekali.

**Pengiriman file** — `src/app/api/kalkulator-hpp-desktop/download/route.ts`: `GET ?order=...&token=...`, verifikasi lewat RPC (status harus `settlement` dan token cocok), baru stream file installer dari lokasi **privat** (di luar folder `public/`, misal `private-assets/kalkulator-hpp-desktop-setup.exe` di root repo) — supaya URL download tidak bisa ditebak/dibagikan tanpa token yang valid.

**Batasan yang diterima untuk v1** (didokumentasikan, bukan dikerjakan sekarang): belum ada pengiriman email (belum ada integrasi email service sama sekali di proyek ini) — link download cuma tampil di halaman "selesai" setelah bayar; kalau pembeli menutup halaman itu sebelum sempat download, mereka harus hubungi kamu manual untuk sekarang. Bisa ditambah nanti (mis. Resend) sebagai fast-follow.

## Verifikasi

1. Migrasi baru ditempel ke Supabase SQL Editor (lihat memory `supabase-migrations-manual`).
2. `npm test` + `tsc` + `eslint` untuk kode Next.js yang disentuh.
3. Coba `cd desktop-app && npm install && npm run dist` — laporkan apa adanya kalau berhasil/gagal di lingkungan ini.
4. Browser: buka `/kalkulator-hpp/beli`, isi email, submit → karena `BILLING_MANUAL_MODE = true`, harus tampil kontak manual (bukan error Midtrans) — konsisten dengan halaman billing bisnis yang sudah ada.
5. Simulasikan webhook `settlement` untuk order `HPP-...` (pola sama seperti yang sudah dipakai memverifikasi sistem billing bisnis — hand-crafted signed payload) → pastikan `download_token` terisi, halaman `/kalkulator-hpp/beli/selesai?order_id=...` menampilkan link download yang benar-benar bisa mengunduh file.
6. Pastikan webhook untuk order `KK-...` (bisnis) sama sekali tidak berubah perilakunya (regresi check terhadap sistem billing bisnis yang sudah ada).
