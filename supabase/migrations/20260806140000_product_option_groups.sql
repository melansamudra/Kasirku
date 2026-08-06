-- Sistem opsi/modifier produk (seperti Moka POS).
-- Satu produk bisa punya banyak grup opsi (mis. "Pilih Minuman", "Pilih Nasi").
-- Setiap grup punya beberapa pilihan dengan penyesuaian harga masing-masing.
-- Saat kasir tap produk di POS, popup muncul untuk memilih opsi.

-- Grup opsi (mis. "Pilih Minuman")
create table public.product_option_groups (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  name         text not null,
  required     boolean not null default true,
  sort_order   smallint not null default 0,
  created_at   timestamptz not null default now()
);

create index product_option_groups_product_id_idx
  on public.product_option_groups (product_id);

alter table public.product_option_groups enable row level security;

create policy "Owner manages option groups of own products"
on public.product_option_groups for all
using (
  exists (
    select 1 from public.products p
    where p.id = product_id
      and private.owns_business(p.business_id)
  )
)
with check (
  exists (
    select 1 from public.products p
    where p.id = product_id
      and private.owns_business(p.business_id)
  )
);

-- Pilihan dalam satu grup (mis. "Es", "Panas")
create table public.product_options (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references public.product_option_groups (id) on delete cascade,
  name             text not null,
  price_adjustment numeric(12, 2) not null default 0,
  sort_order       smallint not null default 0
);

create index product_options_group_id_idx
  on public.product_options (group_id);

alter table public.product_options enable row level security;

create policy "Owner manages options of own products"
on public.product_options for all
using (
  exists (
    select 1 from public.product_option_groups g
    join public.products p on p.id = g.product_id
    where g.id = group_id
      and private.owns_business(p.business_id)
  )
)
with check (
  exists (
    select 1 from public.product_option_groups g
    join public.products p on p.id = g.product_id
    where g.id = group_id
      and private.owns_business(p.business_id)
  )
);

-- Izinkan anon (self-order) membaca opsi produk yang aktif
create policy "Anon reads option groups"
on public.product_option_groups for select
to anon
using (true);

create policy "Anon reads options"
on public.product_options for select
to anon
using (true);
