-- Extend trial from 3 days to 14 days to match the "14 hari gratis" promise
-- displayed on the landing page and to reduce churn from premature expiry.
create or replace function public.start_trial(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if exists (select 1 from public.subscriptions where business_id = p_business_id) then
    raise exception 'subscription already exists for this business';
  end if;

  insert into public.subscriptions (business_id, plan_code, status, period_end)
  values (p_business_id, 'trial', 'trialing', now() + interval '14 days');
end;
$$;
