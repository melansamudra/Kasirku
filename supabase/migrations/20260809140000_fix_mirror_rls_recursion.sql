-- Fix: infinite recursion di RLS policy mirror_accounts
-- Penyebab: "mirror user reads assigned business" pada tabel businesses
-- melakukan EXISTS query ke mirror_accounts, yang memicu RLS mirror_accounts,
-- yang memanggil private.owns_business → businesses → mirror_accounts → loop.
--
-- Solusi: bungkus EXISTS query dalam SECURITY DEFINER function yang bypass RLS.

create or replace function private.user_has_mirror_access(p_business_id uuid)
returns boolean
language sql
security definer
set search_path = public, private
as $$
  select exists (
    select 1 from public.mirror_accounts
    where mirror_accounts.business_id = p_business_id
      and mirror_accounts.user_id = auth.uid()
      and mirror_accounts.status in ('active', 'pending')
  );
$$;

drop policy if exists "mirror user reads assigned business" on public.businesses;

create policy "mirror user reads assigned business"
  on public.businesses for select
  using (private.user_has_mirror_access(id));
