-- Laporan Harian (reports/harian) butuh pisahin Pengeluaran Tunai vs
-- Transfer -- sistem sekarang tidak bedain cara bayar sama sekali, semua
-- kas manual (dan otomatis) nyentuh satu akun Kas & Bank gabungan. Kolom
-- ini nullable & cuma diisi manual lewat form "Catat Kas Masuk/Keluar" --
-- entri otomatis lain (penjualan, kasbon, dll) tidak perlu diisi, defaultnya
-- diperlakukan sebagai tunai di laporan (petty cash/kas kecil pada
-- dasarnya memang uang tunai).
alter table public.journal_entries
  add column if not exists payment_method text check (payment_method in ('tunai', 'transfer'));
