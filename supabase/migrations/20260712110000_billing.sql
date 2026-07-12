-- Billing: subscription/lifetime-plan tracking + payment transaction log.
-- Plans themselves (name/price/period) live in code (src/lib/billing/plans.ts),
-- not the DB — fastest to ship, revisit if pricing needs to change without a
-- deploy. Only the current subscription STATE is in the DB (one row per
-- business, mutated in place, like `businesses` itself), plus an append-only
-- payment log for the Midtrans transaction history/audit trail.
--
-- Writes to both tables from the authenticated client are intentionally
-- narrow: a business can only ever INSERT a 'pending' payment (to kick off a
-- Midtrans transaction) and can only ever SELECT its own subscription state.
-- Every state transition (pending -> settlement, unpaid -> active, active ->
-- past_due -> expired) is written exclusively by the service-role Midtrans
-- webhook or the cron sweep, both of which bypass RLS entirely — so a
-- business can never mark its own subscription paid.
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses (id) on delete cascade,
  plan_code text not null,
  status text not null default 'unpaid'
    check (status in ('unpaid', 'active', 'past_due', 'expired')),
  period_end timestamptz, -- null = lifetime plan / never expires
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "Owner reads own subscription"
on public.subscriptions for select
using (private.owns_business(business_id));

-- Onboarding inserts this exactly once, right after creating the business,
-- always as 'unpaid'. No update policy exists for authenticated users, so a
-- business can never transition its own status to active/past_due/expired
-- — only the service-role webhook and cron sweep can do that.
create policy "Owner creates own initial subscription"
on public.subscriptions for insert
with check (private.owns_business(business_id) and status = 'unpaid');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  plan_code text not null,
  order_id text not null unique,
  amount numeric(14, 2) not null check (amount > 0),
  status text not null default 'pending'
    check (status in ('pending', 'settlement', 'expire', 'cancel', 'deny')),
  midtrans_transaction_id text,
  payment_type text,
  raw_notification jsonb,
  created_at timestamptz not null default now()
);

create index payments_business_id_idx on public.payments (business_id, created_at desc);

alter table public.payments enable row level security;

create policy "Owner reads own payments"
on public.payments for select
using (private.owns_business(business_id));

create policy "Owner creates own pending payments"
on public.payments for insert
with check (private.owns_business(business_id) and status = 'pending');

-- Grandfather every business that existed before billing was introduced —
-- otherwise they'd have no subscription row at all, which getSubscriptionAccess()
-- treats as 'unpaid' (locked out). These are pre-existing tenants (including
-- test businesses), not new signups, so they get permanent free access
-- ('lifetime', never expires) rather than being forced to suddenly pay.
insert into public.subscriptions (business_id, plan_code, status, period_end)
select id, 'lifetime', 'active', null
from public.businesses
on conflict (business_id) do nothing;
