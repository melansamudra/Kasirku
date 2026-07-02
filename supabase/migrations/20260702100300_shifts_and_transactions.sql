-- Module 3: shifts, transactions, transaction_items, transaction_payments,
-- transaction_ingredient_consumption — core operational data.

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  cashier_id uuid not null references public.cashiers (id),
  opening_cash numeric(12, 2) not null default 0,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closing_cash numeric(12, 2),
  notes text,
  close_notes text,
  cash_sales numeric(12, 2) not null default 0,
  non_cash_sales numeric(12, 2) not null default 0,
  total_sales numeric(12, 2) not null default 0,
  expected_cash numeric(12, 2),
  difference numeric(12, 2),
  tx_count int not null default 0,
  void_count int not null default 0
);

-- Fast lookup of "shift aktif sekarang" (closed_at is null) per business.
create index shifts_business_id_closed_at_idx on public.shifts (business_id, closed_at);

alter table public.shifts enable row level security;

create policy "Owner manages shifts of own businesses"
on public.shifts for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Transactions -------------------------------------------------------------

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  shift_id uuid references public.shifts (id) on delete set null,
  cashier_id uuid not null references public.cashiers (id),
  invoice_number text not null,
  date timestamptz not null default now(),
  subtotal_raw numeric(12, 2) not null default 0,
  subtotal numeric(12, 2) not null default 0,
  service numeric(12, 2) not null default 0,
  tax numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  total_item_disc numeric(12, 2) not null default 0,
  order_disc_amt numeric(12, 2) not null default 0,
  total_cost numeric(12, 2) not null default 0,
  gross_profit numeric(12, 2) not null default 0,
  is_split boolean not null default false,
  voided boolean not null default false,
  voided_at timestamptz,
  void_reason text,
  voided_by uuid references public.cashiers (id),
  -- References public.tables(id), added once that table exists — see
  -- 20260702100500_fnb_support_tables.sql.
  table_id uuid,
  constraint transactions_business_id_invoice_number_key unique (business_id, invoice_number)
);

-- Almost every report filters by business + date range.
create index transactions_business_id_date_idx on public.transactions (business_id, date);
create index transactions_shift_id_idx on public.transactions (shift_id);

alter table public.transactions enable row level security;

create policy "Owner manages transactions of own businesses"
on public.transactions for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Transaction items (snapshot of product name/price/cost at time of sale) --

create table public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  name text not null,
  category text,
  price numeric(12, 2) not null,
  cost numeric(12, 2) not null default 0,
  qty numeric(12, 2) not null,
  note text
);

create index transaction_items_transaction_id_idx on public.transaction_items (transaction_id);
create index transaction_items_product_id_idx on public.transaction_items (product_id);

alter table public.transaction_items enable row level security;

create policy "Owner manages items of own transactions"
on public.transaction_items for all
using (
  exists (
    select 1 from public.transactions t
    where t.id = transaction_items.transaction_id
      and private.owns_business(t.business_id)
  )
)
with check (
  exists (
    select 1 from public.transactions t
    where t.id = transaction_items.transaction_id
      and private.owns_business(t.business_id)
  )
);

-- Transaction payments (supports split bill: many rows per transaction) ----

create table public.transaction_payments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  method text not null,
  amount numeric(12, 2) not null,
  received numeric(12, 2),
  change numeric(12, 2)
);

create index transaction_payments_transaction_id_idx on public.transaction_payments (transaction_id);

alter table public.transaction_payments enable row level security;

create policy "Owner manages payments of own transactions"
on public.transaction_payments for all
using (
  exists (
    select 1 from public.transactions t
    where t.id = transaction_payments.transaction_id
      and private.owns_business(t.business_id)
  )
)
with check (
  exists (
    select 1 from public.transactions t
    where t.id = transaction_payments.transaction_id
      and private.owns_business(t.business_id)
  )
);

-- Transaction ingredient consumption (snapshot, used to reverse stock on void) --

create table public.transaction_ingredient_consumption (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id),
  qty numeric(12, 4) not null
);

create index transaction_ingredient_consumption_transaction_id_idx
  on public.transaction_ingredient_consumption (transaction_id);

alter table public.transaction_ingredient_consumption enable row level security;

create policy "Owner manages ingredient consumption of own transactions"
on public.transaction_ingredient_consumption for all
using (
  exists (
    select 1 from public.transactions t
    where t.id = transaction_ingredient_consumption.transaction_id
      and private.owns_business(t.business_id)
  )
)
with check (
  exists (
    select 1 from public.transactions t
    where t.id = transaction_ingredient_consumption.transaction_id
      and private.owns_business(t.business_id)
  )
);
