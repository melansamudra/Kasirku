-- Saklar per bisnis buat menunda pemotongan stok produksi (Produksi/scan
-- publik) tanpa perlu sembunyikan/hapus data yang sudah ada. Default true
-- supaya semua bisnis yang sudah berjalan (termasuk Adi's Culinary) tidak
-- terdampak sama sekali.
alter table public.businesses
  add column if not exists stock_deduction_enabled boolean not null default true;

-- Flag terpisah dari cost_control_enabled: bisnis yang butuh SEMUA fitur
-- operasional "rich" (Produksi, BSJ per lokasi, Biaya, Dokumen Manual, Staf
-- per lokasi, dst -- persis seperti cost_control_enabled) TAPI dengan
-- tampilan/branding standar Kasirku (bukan tema "Cost Control" amber) dan
-- POS yang bisa dibuka kalau suatu saat dibutuhkan. Default false supaya
-- tidak ada bisnis lain yang terdampak.
alter table public.businesses
  add column if not exists rich_stock_ops_enabled boolean not null default false;

-- Llauk Nusantara: masih uji coba, cost-control baru benar-benar dipakai
-- untuk SDM & Payroll. Pindah ke tampilan standar Kasirku (bukan tema Cost
-- Control) TAPI semua fitur existing (Produksi, BSJ, Dokumen Manual, Biaya
-- Operasional, Staf per Lokasi, dst) tetap utuh lewat rich_stock_ops_enabled.
-- Kasir tetap disembunyikan dulu (hidden_nav_keys) sampai diminta dibuka, dan
-- pemotongan stok Produksi dinonaktifkan dulu sampai datanya siap.
update public.businesses
set
  cost_control_enabled = false,
  rich_stock_ops_enabled = true,
  hidden_nav_keys = array['pos'],
  stock_deduction_enabled = false
where id = 'f7c0509b-d708-45d5-9245-592e50f7cbbe';
