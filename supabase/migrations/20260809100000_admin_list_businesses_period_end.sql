-- Tambah period_end ke admin_list_businesses agar admin bisa verifikasi
-- kapan subscription berakhir setelah mengaktifkan langganan manual.
-- Harus drop dulu karena perubahan return type.

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
  plan_code text,
  period_end timestamptz,
  mirroring_enabled boolean
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
    nullif(sub.plan_code, ''),
    sub.period_end,
    coalesce(b.mirroring_enabled, false)
  from public.businesses b
  join auth.users u on u.id = b.owner_id
  left join public.subscriptions sub on sub.business_id = b.id
  order by b.created_at desc;
end;
$$;

grant execute on function public.admin_list_businesses() to authenticated;
