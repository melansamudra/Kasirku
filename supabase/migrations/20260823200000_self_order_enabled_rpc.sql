-- Audit 2026-08-23: setSelfOrderEnabled() di pos/actions.ts meng-update
-- businesses.self_order_enabled langsung dari client tanpa cek error.
-- businesses RLS sengaja cuma izinkan owner_id = auth.uid() (bukan
-- private.owns_business() yang staff-inclusive dipakai tabel lain) --
-- jadi staff/kasir yang toggle di layar POS diam-diam gagal (0 baris
-- ke-update), UI-nya optimistic jadi kelihatan berhasil sampai catalog
-- refresh dan nilainya balik lagi sendiri.
--
-- Fix: RPC sempit khusus kolom self_order_enabled, pola sama dengan
-- set_journal_entry_payment_method -- staff-inclusive (owns_business)
-- tanpa membuka policy UPDATE penuh di businesses (yang sengaja owner-only
-- untuk data lain seperti owner_id/mirroring_enabled/dll).
create or replace function public.set_business_self_order_enabled(
  p_business_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  update public.businesses
  set self_order_enabled = p_enabled
  where id = p_business_id;
end;
$$;

grant execute on function public.set_business_self_order_enabled(uuid, boolean) to authenticated;
