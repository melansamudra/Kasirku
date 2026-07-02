-- Module 5: tables, self_orders, self_order_items, kitchen_printers,
-- custom_payment_methods — F&B supporting features.

create table public.custom_payment_methods (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null
);

create index custom_payment_methods_business_id_idx on public.custom_payment_methods (business_id);

alter table public.custom_payment_methods enable row level security;

create policy "Owner manages custom payment methods of own businesses"
on public.custom_payment_methods for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Kitchen printers -------------------------------------------------------------

create table public.kitchen_printers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  categories text[] not null default '{}',
  connection_type text not null default 'bluetooth' check (connection_type in ('bluetooth', 'lan')),
  address text
);

create index kitchen_printers_business_id_idx on public.kitchen_printers (business_id);

alter table public.kitchen_printers enable row level security;

create policy "Owner manages kitchen printers of own businesses"
on public.kitchen_printers for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Tables (self-order, F&B) -----------------------------------------------------

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  qr_slug text not null unique
);

create index tables_business_id_idx on public.tables (business_id);

alter table public.tables enable row level security;

create policy "Owner manages tables of own businesses"
on public.tables for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Now that public.tables exists, wire up the deferred FK from transactions.
alter table public.transactions
  add constraint transactions_table_id_fkey
  foreign key (table_id) references public.tables (id) on delete set null;

create index transactions_table_id_idx on public.transactions (table_id);

-- Self orders --------------------------------------------------------------

create table public.self_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  table_id uuid not null references public.tables (id) on delete cascade,
  status text not null default 'baru' check (status in ('baru', 'diproses', 'selesai')),
  created_at timestamptz not null default now()
);

create index self_orders_business_id_idx on public.self_orders (business_id);
create index self_orders_table_id_idx on public.self_orders (table_id);

alter table public.self_orders enable row level security;

create policy "Owner manages self orders of own businesses"
on public.self_orders for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Self order items -----------------------------------------------------------

create table public.self_order_items (
  id uuid primary key default gen_random_uuid(),
  self_order_id uuid not null references public.self_orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  name text not null,
  price numeric(12, 2) not null,
  qty numeric(12, 2) not null,
  note text
);

create index self_order_items_self_order_id_idx on public.self_order_items (self_order_id);

alter table public.self_order_items enable row level security;

create policy "Owner manages self order items of own businesses"
on public.self_order_items for all
using (
  exists (
    select 1 from public.self_orders so
    where so.id = self_order_items.self_order_id
      and private.owns_business(so.business_id)
  )
)
with check (
  exists (
    select 1 from public.self_orders so
    where so.id = self_order_items.self_order_id
      and private.owns_business(so.business_id)
  )
);
