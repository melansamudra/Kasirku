-- Admin sub-accounts: owner invites a staff member (their own email/password
-- Supabase Auth account) with a per-feature permission checklist. Enforcement
-- is app-layer only (DashboardShell hides/blocks nav and page content) — at
-- the DB layer, active staff get the SAME access as the owner via a single
-- change to owns_business(), rather than rewriting RLS across every table
-- that already references it. See dashboard-shell.tsx / (dashboard)/layout.tsx.

create table public.business_staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  permissions text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index business_staff_business_id_idx on public.business_staff (business_id);
create index business_staff_user_id_idx on public.business_staff (user_id);

alter table public.business_staff enable row level security;

-- security definer so this bypasses RLS internally when it queries
-- businesses — used by business_staff's owner-check policy below. Without
-- this, that policy's raw subquery against businesses would run under
-- normal RLS, which (once businesses gets its own staff-read policy further
-- down, querying business_staff back) creates mutual recursion between the
-- two tables' policies ("infinite recursion detected in policy for
-- relation businesses").
create or replace function private.is_business_owner(check_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = check_business_id and b.owner_id = auth.uid()
  );
$$;

-- Owner-only management — checked via is_business_owner(), never via
-- owns_business() (which is about to include staff themselves; staff must
-- never be able to grant/edit their own or others' permissions).
create policy "Owner manages staff of own businesses"
on public.business_staff for all
using (private.is_business_owner(business_id))
with check (private.is_business_owner(business_id));

-- A staff member can see their own membership row (permissions list etc).
create policy "Staff reads own membership"
on public.business_staff for select
using (user_id = auth.uid());

-- owns_business() is referenced by RLS policies on nearly every other table
-- (transactions, products, accounting, shifts, ...) — extending it here is
-- the one change that gives active staff the same operational DB access as
-- the owner everywhere else, without touching each of those policies.
create or replace function private.owns_business(check_business_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = check_business_id
      and b.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.business_staff s
    where s.business_id = check_business_id
      and s.user_id = auth.uid()
      and s.active
  );
$$;

-- businesses itself is deliberately NOT extended to give staff UPDATE/DELETE
-- (its existing "for all" policy stays owner_id-only) — only a new
-- SELECT-only policy, so staff can never touch owner_id or other business
-- settings via a raw API call even though owns_business() now includes them.
-- `businesses.id` is qualified explicitly — business_staff also has an `id`
-- column, and an unqualified `id` here would resolve to the subquery's own
-- business_staff.id (shadowing the outer table), silently comparing a
-- staff row's own id to its business_id and never matching.
create policy "Staff reads own businesses"
on public.businesses for select
using (
  exists (
    select 1 from public.business_staff s
    where s.business_id = businesses.id and s.user_id = auth.uid() and s.active
  )
);
