-- Gudang ke-6: "Gudang Purchasing" — buffer stok bahan baku yang sudah
-- dibeli tapi belum disalurkan ke Gudang Kering/Basah. Beda dari
-- ingredients.stock (itu tetap berarti stok SIAP PAKAI di Gudang
-- Kering/Basah — dipakai HPP & Produksi, TIDAK diubah sama sekali di sini)
-- — buffer ini murni tempat singgah sebelum "Gudang minta barang" menyalurkannya.
alter table public.warehouses drop constraint if exists warehouses_kind_check;
alter table public.warehouses add constraint warehouses_kind_check
  check (kind in ('bahan_baku', 'setengah_jadi', 'purchasing'));

insert into public.warehouses (business_id, name, kind)
select id, 'Gudang Purchasing', 'purchasing' from public.businesses where cost_control_enabled = true
on conflict (business_id, name) do nothing;

create table public.warehouse_stock (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  stock numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (warehouse_id, ingredient_id)
);

create index warehouse_stock_business_id_idx on public.warehouse_stock (business_id);

create trigger warehouse_stock_set_updated_at
  before update on public.warehouse_stock
  for each row execute function private.set_updated_at();

alter table public.warehouse_stock enable row level security;

create policy "Owner manages warehouse stock of own businesses"
on public.warehouse_stock for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
