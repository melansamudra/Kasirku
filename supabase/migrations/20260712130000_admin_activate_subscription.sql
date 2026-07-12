-- Manual activation path for /admin: while Midtrans is offline/unverified
-- (or for any future offline bank-transfer case), the superadmin needs a way
-- to mark a business as paid after confirming payment themselves — see
-- [[billing-midtrans]]. Business logic mirrors the webhook's activation
-- exactly (src/app/api/midtrans/notification/route.ts): extend from the
-- greater of now() or the existing period_end so an early renewal doesn't
-- lose paid-for days; p_period_days null means a lifetime plan (never
-- expires). Records a 'manual' payment row for the same audit trail the
-- Midtrans webhook produces, just tagged differently.
create or replace function public.admin_activate_subscription(
  p_business_id uuid,
  p_plan_code text,
  p_period_days int,
  p_amount numeric,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_period_end timestamptz;
  v_new_period_end timestamptz;
begin
  if not private.is_admin() then
    raise exception 'not authorized';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select period_end into v_current_period_end
  from public.subscriptions
  where business_id = p_business_id;

  if p_period_days is null then
    v_new_period_end := null;
  else
    v_new_period_end := greatest(now(), coalesce(v_current_period_end, now()))
      + (p_period_days || ' days')::interval;
  end if;

  insert into public.payments (
    business_id, plan_code, order_id, amount, status, payment_type, raw_notification
  )
  values (
    p_business_id,
    p_plan_code,
    'MANUAL-' || replace(p_business_id::text, '-', '') || '-' || floor(extract(epoch from now()))::text,
    p_amount,
    'settlement',
    'manual',
    jsonb_build_object('note', p_note, 'activated_by', 'admin')
  );

  insert into public.subscriptions (business_id, plan_code, status, period_end, updated_at)
  values (p_business_id, p_plan_code, 'active', v_new_period_end, now())
  on conflict (business_id) do update set
    plan_code = excluded.plan_code,
    status = 'active',
    period_end = excluded.period_end,
    updated_at = now();
end;
$$;

grant execute on function public.admin_activate_subscription(uuid, text, int, numeric, text) to authenticated;
