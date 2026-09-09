-- Meja "penuh"/diblokir dari reservasi online: bukan tabel baru -- cukup
-- baris reservations biasa (customer_name generik) yang menandai slot
-- meja+tanggal itu terpakai, karena get_storefront_table_availability()
-- sudah menganggap "taken" = ada reservations non-cancelled dgn table_id+
-- tanggal yang sama. is_manual_block cuma penanda tampilan admin (beda
-- warna/label dari reservasi pelanggan asli), tidak mengubah logika taken.
alter table public.reservations add column is_manual_block boolean not null default false;

-- Menu "kosong"/habis -- toggle cepat dari kasir, beda dari products.stock
-- (yang buat bisnis FnB biasa dipakai placeholder besar/tidak dilacak
-- ketat). available=false artinya "sengaja disembunyikan sementara",
-- independen dari angka stok.
alter table public.products add column available boolean not null default true;
