-- Global visibility tables for mirror accounts.
-- Instead of per-account selections, any item toggled on is visible
-- to ALL active mirror accounts of that business.

-- Transactions ------------------------------------------------------------

create table public.mirror_visible_transactions (
  business_id    uuid not null references public.businesses(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (business_id, transaction_id)
);

alter table public.mirror_visible_transactions enable row level security;

create policy "owner manages mirror tx visibility"
  on public.mirror_visible_transactions for all
  using  (private.owns_business(business_id))
  with check (private.owns_business(business_id));

create policy "mirror user reads tx visibility"
  on public.mirror_visible_transactions for select
  using (
    business_id in (
      select business_id from public.mirror_accounts
      where user_id = auth.uid() and status = 'active'
    )
  );

-- Kas harian (journal lines) -----------------------------------------------

create table public.mirror_visible_kas (
  business_id     uuid not null references public.businesses(id) on delete cascade,
  journal_line_id uuid not null references public.journal_lines(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (business_id, journal_line_id)
);

alter table public.mirror_visible_kas enable row level security;

create policy "owner manages mirror kas visibility"
  on public.mirror_visible_kas for all
  using  (private.owns_business(business_id))
  with check (private.owns_business(business_id));

create policy "mirror user reads kas visibility"
  on public.mirror_visible_kas for select
  using (
    business_id in (
      select business_id from public.mirror_accounts
      where user_id = auth.uid() and status = 'active'
    )
  );
