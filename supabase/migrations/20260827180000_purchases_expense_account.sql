-- Pembelian kategori "Lainnya" (bukan bahan baku/barang dagang) selama ini
-- selalu didebit ke 1-200 Persediaan di jurnal, padahal barangnya belum
-- tentu persediaan (mis. banner MMT, service, dll). Tambah kolom supaya
-- pengguna bisa pilih akun beban yang sesuai (Marketing, Perlengkapan, dll)
-- untuk baris "Lainnya" -- null berarti masih fallback ke 1-200 seperti
-- sebelumnya (kompatibel dengan data lama).
alter table public.purchases
  add column expense_account_code text null;
