-- Module 1: businesses, cashiers — foundation for auth & access.

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  business_type text not null check (business_type in ('fnb', 'retail')),
  address text,
  phone text,
  npwp text,
  logo_url text,
  tax_enabled boolean not null default false,
  tax_rate numeric(5, 2) not null default 0,
  service_enabled boolean not null default false,
  service_rate numeric(5, 2) not null default 0,
  auto_lock_enabled boolean not null default true,
  auto_lock_minutes int not null default 5,
  recovery_code_hash text,
  created_at timestamptz not null default now()
);

create index businesses_owner_id_idx on public.businesses (owner_id);

alter table public.businesses enable row level security;

create policy "Owner has full access to own businesses"
on public.businesses for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- Reusable RLS predicate: does the current user own the business that a row belongs to?
-- security definer + stable + fixed search_path so it can be inlined efficiently by the
-- planner and safely referenced from every table's RLS policy instead of repeating the
-- `business_id in (select id from businesses where owner_id = auth.uid())` subquery.
-- Defined here (not in the extensions migration) because it needs `businesses` to exist.
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
  );
$$;

-- Cashiers -------------------------------------------------------------

create table public.cashiers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  role text not null check (role in ('kasir', 'manajer')),
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index cashiers_business_id_idx on public.cashiers (business_id);

alter table public.cashiers enable row level security;

create policy "Owner manages cashiers of own businesses"
on public.cashiers for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
