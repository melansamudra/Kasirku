-- Mirror users need to read the business they're assigned to
-- so Server Components can use regular client (RLS-based) instead of service client
-- for the business name/type lookup in the laporan shell and page-level access checks.

create policy "mirror user reads assigned business"
  on public.businesses for select
  using (
    exists (
      select 1 from public.mirror_accounts
      where mirror_accounts.business_id = businesses.id
        and mirror_accounts.user_id = auth.uid()
        and mirror_accounts.status in ('active', 'pending')
    )
  );
