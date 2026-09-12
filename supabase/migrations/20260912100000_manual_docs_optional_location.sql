-- Dokumen Manual (Surat Jalan/Permintaan Barang/Stock Opname bebas isi
-- tangan) sebelumnya wajib punya location_id, jadi cuma bisa diakses lewat
-- halaman per-lokasi (/lokasi/[locationId]/dokumen-manual) -- yang cuma ada
-- untuk bisnis cost-control/rich_stock_ops. Toko baru standar (mayoritas
-- pendaftar sejak onboarding-default-2026-09) sengaja TIDAK dapat
-- stock_locations otomatis, jadi tidak pernah bisa pakai fitur ini sama
-- sekali walau butuh cetak Surat Jalan/PR/Opname manual juga. Arahan user:
-- sediakan versi global (business-scoped, location_id kosong) supaya
-- semua pendaftar baru dapat aksesnya tanpa perlu setup lokasi dulu --
-- "tidak nyangkut kemana-mana".
alter table public.manual_delivery_notes alter column location_id drop not null;
alter table public.manual_purchase_requests alter column location_id drop not null;
alter table public.manual_stock_opnames alter column location_id drop not null;
