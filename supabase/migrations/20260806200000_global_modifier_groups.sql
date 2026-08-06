-- Global modifier groups: dibuat sekali di level bisnis, bisa dipakai banyak produk.
-- Berbeda dari product_option_groups yang product-specific.

create table global_modifier_groups (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  required    boolean not null default true,
  created_at  timestamptz not null default now()
);

create table global_modifier_options (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references global_modifier_groups(id) on delete cascade,
  name        text not null,
  price_adjustment integer not null default 0,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- Junction: produk mana saja yang menggunakan global modifier group tertentu
create table product_global_modifier_links (
  product_id uuid not null references products(id) on delete cascade,
  group_id   uuid not null references global_modifier_groups(id) on delete cascade,
  primary key (product_id, group_id)
);

-- RLS
alter table global_modifier_groups enable row level security;
alter table global_modifier_options enable row level security;
alter table product_global_modifier_links enable row level security;

create policy "owner" on global_modifier_groups
  using (private.owns_business(business_id));
create policy "owner" on global_modifier_options
  using (
    exists (
      select 1 from global_modifier_groups g
      where g.id = group_id and private.owns_business(g.business_id)
    )
  );
create policy "owner" on product_global_modifier_links
  using (
    exists (
      select 1 from products p
      where p.id = product_id and private.owns_business(p.business_id)
    )
  );
