-- Fix: depreciation_postings was only given a SELECT policy, on the
-- (wrong) assumption that writes would go through a security-definer RPC
-- like close_accounting_period. In practice postMonthlyDepreciation()
-- inserts directly from the authenticated client, same as fixed_assets —
-- so it needs the same "for all" owner policy fixed_assets already has.
drop policy if exists "Owner views depreciation postings of own businesses" on public.depreciation_postings;

create policy "Owner manages depreciation postings of own businesses"
on public.depreciation_postings for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
