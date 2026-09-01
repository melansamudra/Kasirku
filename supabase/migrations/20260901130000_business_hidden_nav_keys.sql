-- Matikan menu sidebar tertentu per-bisnis (mis. Dapur Produksi tidak butuh
-- Permintaan Barang/Purchase Order/Transfer Internal/Biaya Operasional lokasi
-- /Target vs Aktual, karena pemesanannya sekarang lewat Surat Jalan dari
-- Llauk -- lihat migrasi 20260901120000). Default kosong supaya SEMUA bisnis
-- yang sudah ada (termasuk Llauk sendiri) tidak terdampak sama sekali --
-- array generik, dicocokkan exact ATAU sebagai akhiran key nav item (lihat
-- isNavKeyHidden di dashboard-shell.tsx), jadi tidak perlu tahu UUID lokasi
-- buat menyembunyikan item per-lokasi.
alter table public.businesses
  add column hidden_nav_keys text[] not null default '{}';

select pg_notify('pgrst', 'reload schema');
