-- Purchase Order sebagai fitur berdiri sendiri, lepas dari paket
-- stock_locations_enabled (yang sekaligus membuka Kartu Stok/Transfer/Stock
-- Opname per lokasi -- kompleksitas yang tidak semua bisnis 1-lokasi mau).
-- Bisnis seperti Mie Kota bisa nyalain PO doang tanpa ikut kebagian
-- fitur per-lokasi lainnya. Cek akses gabungan ada di
-- src/lib/cost-control/has-stock-access.ts (hasPoAccess).
alter table public.businesses add column if not exists po_enabled boolean not null default false;
