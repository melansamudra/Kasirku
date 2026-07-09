-- Mini-ERP: supplier directory + formal pembelian records with utang dagang
-- (accounts payable) tracking. Additive only — the existing "Catat
-- Pengeluaran" purchase categories in finance/actions.ts are untouched; this
-- is a separate, more structured flow for purchases tied to a supplier that
-- may be paid partially or entirely on credit.

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index suppliers_business_id_idx on public.suppliers (business_id);

alter table public.suppliers enable row level security;

create policy "Owner manages suppliers of own businesses"
on public.suppliers for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  date date not null default current_date,
  category text not null check (category in ('Bahan Baku', 'Barang Dagang')),
  ingredient_id uuid references public.ingredients (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  qty numeric(12, 2),
  note text,
  amount numeric(14, 2) not null check (amount > 0),
  paid_amount numeric(14, 2) not null default 0 check (paid_amount >= 0),
  created_at timestamptz not null default now(),
  constraint purchases_paid_not_over_amount check (paid_amount <= amount)
);

create index purchases_business_id_idx on public.purchases (business_id, date desc);
create index purchases_supplier_id_idx on public.purchases (supplier_id);

alter table public.purchases enable row level security;

create policy "Owner manages purchases of own businesses"
on public.purchases for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

create table public.purchase_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  date date not null default current_date,
  amount numeric(14, 2) not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);

create index purchase_payments_purchase_id_idx on public.purchase_payments (purchase_id, created_at desc);
create index purchase_payments_business_id_idx on public.purchase_payments (business_id);

alter table public.purchase_payments enable row level security;

create policy "Owner manages purchase payments of own businesses"
on public.purchase_payments for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
