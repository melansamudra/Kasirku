-- Stok per lokasi fisik (Gudang Utama, Kitchen Atas, Dapur Produksi, Bar
-- Llauk, dst) -- sengaja TABEL PENDAMPING TERPISAH, bukan mengubah makna
-- ingredients.stock/semi_finished_items.stock, mengikuti pola yang sudah ada
-- untuk warehouse_stock (buffer purchasing) & outlet_stock (stok per outlet).
-- Kolom stock tunggal yang lama TETAP dipakai apa adanya oleh checkout POS,
-- pembelian, Permintaan Gudang/Resto, dan Catat Produksi yang sudah ada --
-- mengubah maknanya berisiko merusak alur itu untuk SEMUA bisnis FNB, bukan
-- cuma bisnis cost-control ini. Stok per-lokasi ini murni lapisan baru yang
-- berjalan paralel (dipakai buat opname & visibilitas per lokasi dulu);
-- menyambungkannya ke Catat Produksi (supaya produksi memotong stok di
-- lokasi yang dipilih) adalah pekerjaan lanjutan yang terpisah.
create table public.stock_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, name)
);

create index stock_locations_business_id_idx on public.stock_locations (business_id);

alter table public.stock_locations enable row level security;

create policy "Owner manages stock locations of own businesses"
on public.stock_locations for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

create table public.ingredient_location_stock (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  location_id uuid not null references public.stock_locations (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  stock numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (location_id, ingredient_id)
);

create index ingredient_location_stock_location_id_idx on public.ingredient_location_stock (location_id);
create index ingredient_location_stock_ingredient_id_idx on public.ingredient_location_stock (ingredient_id);

alter table public.ingredient_location_stock enable row level security;

create policy "Owner manages ingredient location stock of own businesses"
on public.ingredient_location_stock for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

create table public.semi_finished_item_location_stock (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  location_id uuid not null references public.stock_locations (id) on delete cascade,
  semi_finished_item_id uuid not null references public.semi_finished_items (id) on delete cascade,
  stock numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (location_id, semi_finished_item_id)
);

create index semi_finished_item_location_stock_location_id_idx on public.semi_finished_item_location_stock (location_id);
create index semi_finished_item_location_stock_item_id_idx on public.semi_finished_item_location_stock (semi_finished_item_id);

alter table public.semi_finished_item_location_stock enable row level security;

create policy "Owner manages semi finished item location stock of own businesses"
on public.semi_finished_item_location_stock for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- location_id murni konteks tambahan pada baris stock_adjustments yang sudah
-- ada -- boleh null (penyesuaian lama/tanpa lokasi) atau terisi (penyesuaian
-- per-lokasi baru). Tidak mengubah constraint target (ingredient/product/
-- semi_finished_item) yang sudah ada.
alter table public.stock_adjustments
  add column location_id uuid references public.stock_locations (id) on delete set null;

create index stock_adjustments_location_id_idx on public.stock_adjustments (location_id);

insert into public.stock_locations (business_id, name, sort_order) values
  ('f7c0509b-d708-45d5-9245-592e50f7cbbe', 'Gudang Utama', 1),
  ('f7c0509b-d708-45d5-9245-592e50f7cbbe', 'Kitchen Atas', 2),
  ('f7c0509b-d708-45d5-9245-592e50f7cbbe', 'Dapur Produksi', 3),
  ('f7c0509b-d708-45d5-9245-592e50f7cbbe', 'Bar Llauk', 4);
