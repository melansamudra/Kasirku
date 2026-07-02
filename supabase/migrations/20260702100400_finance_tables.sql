-- Module 4: expenses, inventory_snapshots, reconciliations, merchant_fees.

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  date date not null,
  category text not null,
  amount numeric(12, 2) not null,
  note text,
  -- Filled when category = 'Pembelian Bahan Baku'.
  ingredient_id uuid references public.ingredients (id) on delete set null,
  -- Filled when category = 'Pembelian Barang Dagang'.
  product_id uuid references public.products (id) on delete set null,
  qty numeric(12, 4),
  created_at timestamptz not null default now()
);

create index expenses_business_id_date_idx on public.expenses (business_id, date);

alter table public.expenses enable row level security;

create policy "Owner manages expenses of own businesses"
on public.expenses for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Inventory snapshots --------------------------------------------------------

create table public.inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  date date not null,
  value numeric(14, 2) not null,
  manual boolean not null default false,
  constraint inventory_snapshots_business_id_date_key unique (business_id, date)
);

alter table public.inventory_snapshots enable row level security;

create policy "Owner manages inventory snapshots of own businesses"
on public.inventory_snapshots for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Reconciliations -------------------------------------------------------------

create table public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  date date not null,
  method text not null,
  actual_amount numeric(12, 2) not null,
  note text
);

create index reconciliations_business_id_date_idx on public.reconciliations (business_id, date);

alter table public.reconciliations enable row level security;

create policy "Owner manages reconciliations of own businesses"
on public.reconciliations for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Merchant fees (MDR) per payment method --------------------------------------

create table public.merchant_fees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  method text not null,
  fee_percent numeric(5, 2) not null default 0,
  constraint merchant_fees_business_id_method_key unique (business_id, method)
);

alter table public.merchant_fees enable row level security;

create policy "Owner manages merchant fees of own businesses"
on public.merchant_fees for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
