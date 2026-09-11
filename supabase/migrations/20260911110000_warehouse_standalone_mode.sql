-- "Bahan Gudang" berdiri sendiri (standalone) -- opsi KEDUA untuk lokasi
-- Gudang murni (is_default_purchase && !is_production), di samping jalur
-- lama yang sudah ada (stok Gudang pakai ingredients/ingredient_location_stock
-- yang sama dengan Kitchen/Bar, bisa ditransfer & dipakai resep).
--
-- Owner yang pilih per lokasi lewat kolom warehouse_mode ini:
--   'connected'  (default, jalur lama, tidak berubah sama sekali)
--   'standalone' (baru) -- barang dicatat sendiri di warehouse_items, TIDAK
--                nyambung ke ingredients/resep/Transfer Bahan Baku sama
--                sekali. Kalau barangnya dipakai Kitchen/Bar, dicatat manual.
alter table public.stock_locations
  add column warehouse_mode text not null default 'connected'
    check (warehouse_mode in ('connected', 'standalone'));

create table public.warehouse_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  location_id uuid not null references public.stock_locations (id) on delete cascade,
  name text not null,
  unit text not null,
  stock numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, name)
);

create index warehouse_items_business_id_idx on public.warehouse_items (business_id);
create index warehouse_items_location_id_idx on public.warehouse_items (location_id);

alter table public.warehouse_items enable row level security;

create policy "Owner manages warehouse items of own businesses"
on public.warehouse_items for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Pakai tabel riwayat stock_adjustments yang sama (pola sudah ada buat
-- product_id/ingredient_id/semi_finished_item_id) supaya "Sesuaikan Stok"
-- barang Gudang standalone juga punya riwayat, tanpa bikin tabel baru lagi.
alter table public.stock_adjustments
  add column warehouse_item_id uuid references public.warehouse_items (id) on delete set null;

create index stock_adjustments_warehouse_item_id_idx
  on public.stock_adjustments (warehouse_item_id);

alter table public.stock_adjustments drop constraint stock_adjustments_target_chk;
alter table public.stock_adjustments add constraint stock_adjustments_target_chk check (
  (product_id is not null and ingredient_id is null and semi_finished_item_id is null and warehouse_item_id is null)
  or (product_id is null and ingredient_id is not null and semi_finished_item_id is null and warehouse_item_id is null)
  or (product_id is null and ingredient_id is null and semi_finished_item_id is not null and warehouse_item_id is null)
  or (product_id is null and ingredient_id is null and semi_finished_item_id is null and warehouse_item_id is not null)
);
