-- Harga per satuan buat barang Gudang standalone -- dibutuhkan supaya tab
-- "Nilai Persediaan" di Stock Opname (stok x harga) juga bisa jalan buat
-- lokasi Gudang mode "Berdiri Sendiri" (sebelumnya cuma ingredients yang
-- punya unit_cost, lihat migrasi warehouse_stock_opname).
alter table public.warehouse_items
  add column unit_cost numeric(14, 4) not null default 0;
