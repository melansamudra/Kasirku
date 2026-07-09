-- Superadmin panel (read-only overview across all tenants).
-- KasirKu is sold to multiple business owners; the seller needs a way to see
-- every registered toko and basic usage stats without going through each
-- tenant's own RLS-scoped view. Admins are seeded manually (paste a row into
-- this table via the Supabase SQL Editor) — there is no self-service signup
-- for this role by design.

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
-- Intentionally no policies: this table is only ever read via the
-- security-definer functions below, never queried directly by clients.

create or replace function private.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a where a.user_id = auth.uid()
  );
$$;

-- Aggregate usage stats across every tenant.
create or replace function public.admin_stats()
returns table (
  total_businesses bigint,
  total_owners bigint,
  fnb_count bigint,
  retail_count bigint,
  tiket_count bigint,
  tx_today bigint,
  new_businesses_7d bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select
    (select count(*) from public.businesses),
    (select count(distinct owner_id) from public.businesses),
    (select count(*) from public.businesses where business_type = 'fnb'),
    (select count(*) from public.businesses where business_type = 'retail'),
    (select count(*) from public.businesses where business_type = 'tiket'),
    (
      select
        coalesce((select count(*) from public.transactions where date::date = current_date and not voided), 0)
        + coalesce((select count(*) from public.ticket_transactions where date::date = current_date and not voided), 0)
    ),
    (select count(*) from public.businesses where created_at >= now() - interval '7 days');
end;
$$;

grant execute on function public.admin_stats() to authenticated;

-- Full list of tenants with owner email and basic activity signals.
create or replace function public.admin_list_businesses()
returns table (
  id uuid,
  name text,
  business_type text,
  owner_email text,
  created_at timestamptz,
  shift_open boolean,
  tx_count bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select
    b.id,
    b.name,
    b.business_type,
    u.email::text,
    b.created_at,
    exists (
      select 1 from public.shifts s
      where s.business_id = b.id and s.closed_at is null
    ),
    (
      coalesce((select count(*) from public.transactions t where t.business_id = b.id and not t.voided), 0)
      + coalesce((select count(*) from public.ticket_transactions tt where tt.business_id = b.id and not tt.voided), 0)
    )
  from public.businesses b
  join auth.users u on u.id = b.owner_id
  order by b.created_at desc;
end;
$$;

grant execute on function public.admin_list_businesses() to authenticated;
