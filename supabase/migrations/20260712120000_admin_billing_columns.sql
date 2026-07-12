-- Surface subscription status in the read-only /admin overview (see
-- [[mini-erp-scope]]-style follow-up pattern: small targeted redefinition of
-- an existing RPC, not a new admin billing back-office).
--
-- Postgres won't let CREATE OR REPLACE change a function's OUT-parameter row
-- shape (adding subscription_status/plan_code counts as that), so the old
-- signature has to be dropped first.
drop function if exists public.admin_list_businesses();

create function public.admin_list_businesses()
returns table (
  id uuid,
  name text,
  business_type text,
  owner_email text,
  created_at timestamptz,
  shift_open boolean,
  tx_count bigint,
  subscription_status text,
  plan_code text
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
    exists (select 1 from public.shifts s where s.business_id = b.id and s.closed_at is null),
    (
      coalesce((select count(*) from public.transactions t where t.business_id = b.id and not t.voided), 0)
      + coalesce((select count(*) from public.ticket_transactions tt where tt.business_id = b.id and not tt.voided), 0)
    ),
    coalesce(sub.status, 'unpaid'),
    nullif(sub.plan_code, '')
  from public.businesses b
  join auth.users u on u.id = b.owner_id
  left join public.subscriptions sub on sub.business_id = b.id
  order by b.created_at desc;
end;
$$;

grant execute on function public.admin_list_businesses() to authenticated;
