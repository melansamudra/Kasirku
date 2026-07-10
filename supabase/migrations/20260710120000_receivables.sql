-- Mini-ERP: customer receivables (piutang usaha) tracking, mirroring the
-- supplier/purchases utang dagang flow but for the reverse case — credit
-- sales where the customer pays later. Additive/separate from POS checkout,
-- which only supports full payment at time of sale.
create table public.receivables (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  date date not null default current_date,
  description text not null,
  amount numeric(14, 2) not null check (amount > 0),
  paid_amount numeric(14, 2) not null default 0 check (paid_amount >= 0),
  created_at timestamptz not null default now(),
  constraint receivables_paid_not_over_amount check (paid_amount <= amount)
);

create index receivables_business_id_idx on public.receivables (business_id, date desc);
create index receivables_customer_id_idx on public.receivables (customer_id);

alter table public.receivables enable row level security;

create policy "Owner manages receivables of own businesses"
on public.receivables for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

create table public.receivable_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  receivable_id uuid not null references public.receivables (id) on delete cascade,
  date date not null default current_date,
  amount numeric(14, 2) not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);

create index receivable_payments_receivable_id_idx on public.receivable_payments (receivable_id, created_at desc);
create index receivable_payments_business_id_idx on public.receivable_payments (business_id);

alter table public.receivable_payments enable row level security;

create policy "Owner manages receivable payments of own businesses"
on public.receivable_payments for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
