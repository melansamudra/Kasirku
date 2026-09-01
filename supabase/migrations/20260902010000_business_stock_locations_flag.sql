-- Fitur stok multi-lokasi (lite) untuk bisnis FnB standar seperti Adi's
-- Culinary, TANPA menyalakan cost_control_enabled (yang sifatnya
-- all-or-nothing dan akan mengganti total nav & dashboard bisnis).
-- stock_locations_enabled membuka SEBAGIAN rute cost-control (lokasi,
-- kartu stok, transfer, stock opname, PO, BSJ ringan) lewat gate
-- tambahan `hasStockLocationAccess()`, bukan menggantikan cost_control_enabled.
-- Default kolom sengaja false/2: stock_locations_enabled TIDAK true
-- untuk semua bisnis existing lewat migration ini (biar tidak
-- mendadak nongol buat toko lama yang tidak minta), tapi alur
-- pendaftaran toko baru (lihat kode signup) akan set
-- stock_locations_enabled=true + seed 3 lokasi otomatis KHUSUS untuk
-- business_type='fnb'. po_approval_levels default 2 berlaku untuk
-- SEMUA bisnis baru (FnB atau bukan) sesuai keputusan produk.
alter table public.businesses
  add column stock_locations_enabled boolean not null default false,
  add column po_approval_levels smallint not null default 2
    check (po_approval_levels in (1, 2));

-- PENTING: kolom baru pakai `default 2`, yang berarti backfill kolom ini
-- ikut nyetel po_approval_levels=2 ke SEMUA baris businesses yang sudah
-- ada -- termasuk Llauk Nusantara, yang approval PO-nya SEKARANG 1 level
-- dan harus TETAP 1 level (zero regression). Pin balik Llauk ke 1 secara
-- eksplisit; bisnis lama lain (retail/tiket/fnb tanpa cost-control) aman
-- ikut default 2 karena mereka tidak pernah bikin PO sama sekali.
update public.businesses
set po_approval_levels = 1
where id = 'f7c0509b-d708-45d5-9245-592e50f7cbbe'; -- Llauk Nusantara

-- Adi's Culinary = 2 bisnis terpisah (per outlet), masing-masing dapat
-- 3 lokasi sendiri karena stok fisiknya memang terpisah per outlet.
update public.businesses
set stock_locations_enabled = true, po_approval_levels = 2
where id in (
  'b5ebc3c7-cdd7-49fb-87fa-4b83237d8844', -- ADI'S CULINARY BANYUMANIK
  '356ada11-270d-4249-b45c-0a30c12de58c'  -- ADIS'S CULINARY PLEBURAN
);

insert into public.stock_locations (business_id, name, sort_order, is_default_purchase, is_production) values
  ('b5ebc3c7-cdd7-49fb-87fa-4b83237d8844', 'Kitchen', 1, false, false),
  ('b5ebc3c7-cdd7-49fb-87fa-4b83237d8844', 'Bar', 2, false, false),
  ('b5ebc3c7-cdd7-49fb-87fa-4b83237d8844', 'Gudang Utama', 3, true, false),
  ('356ada11-270d-4249-b45c-0a30c12de58c', 'Kitchen', 1, false, false),
  ('356ada11-270d-4249-b45c-0a30c12de58c', 'Bar', 2, false, false),
  ('356ada11-270d-4249-b45c-0a30c12de58c', 'Gudang Utama', 3, true, false);
