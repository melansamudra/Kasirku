-- Automatic 3-day trial for new business signups. Previously every new
-- business landed on 'unpaid' straight out of onboarding and was blocked
-- from the dashboard/POS until they picked and paid for a plan (see
-- src/app/onboarding/actions.ts) — this gives them a look at the product
-- first, mirroring how competitors like Moka trial new signups.

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('unpaid', 'trialing', 'active', 'past_due', 'expired'));

-- Called once, right after onboarding creates the business — hardcodes the
-- 3-day trial length server-side (never trust a client-supplied duration).
-- Guards against being called twice for the same business so a trial can't
-- be repeatedly reset.
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
  values (p_business_id, 'trial', 'trialing', now() + interval '3 days');
end;
$$;

grant execute on function public.start_trial(uuid) to authenticated;
