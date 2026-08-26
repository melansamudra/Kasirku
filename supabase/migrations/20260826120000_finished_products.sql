-- "Produk jadi" murni untuk kontrol HPP & margin (mis. "Rendang Siap Saji
-- 500g") — TIDAK dijual lewat POS Kasirku sama sekali (resto pakai sistem
-- kasir sendiri), jadi sengaja terpisah total dari `products` (yang terikat
-- ke checkout_transaction, barcode, dsb). `selling_price` nullable, murni
-- referensi manual untuk hitung margin di halaman ini — tidak terhubung ke
-- `products.price` POS.

create table public.finished_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  category text,
  selling_price numeric(12, 2),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index finished_products_business_id_idx on public.finished_products (business_id);

create trigger finished_products_set_updated_at
  before update on public.finished_products
  for each row execute function private.set_updated_at();

alter table public.finished_products enable row level security;

create policy "Owner manages finished products of own businesses"
on public.finished_products for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
