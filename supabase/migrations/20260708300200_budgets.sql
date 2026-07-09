-- Mini-ERP accounting module, part 3: budgets for the Target vs Aktual report.

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  period text not null, -- 'YYYY-MM'
  target_amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);

create unique index budgets_business_account_period_key
  on public.budgets (business_id, account_id, period);
create index budgets_business_id_idx on public.budgets (business_id);

alter table public.budgets enable row level security;

create policy "Owner manages budgets of own businesses"
on public.budgets for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
