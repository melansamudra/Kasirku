-- Bug ditemukan lewat audit: migration 20260823140000 nambah kolom
-- journal_entries.payment_method, tapi kas-harian/actions.ts nyoba nyetnya
-- lewat `.update()` langsung dari client -- journal_entries CUMA punya
-- policy SELECT (disengaja, journal_entries.source_id/debit/credit memang
-- immutable begitu diposting, lihat 20260718100000_journal_reversal.sql).
-- Update itu diam-diam kena filter RLS jadi 0 baris, error-nya tidak pernah
-- di-cek -- payment_method NULL selamanya, fitur Tunai/Transfer di Catat Kas
-- kelihatan sukses tapi tidak pernah benar-benar tersimpan.
--
-- Fix-nya BUKAN buka policy UPDATE umum di journal_entries (itu melanggar
-- desain "tidak bisa diedit/dihapus setelah diposting" yang disengaja untuk
-- kolom finansial) -- tapi RPC sempit khusus payment_method saja, sama pola
-- keamanannya (private.owns_business) dengan post_journal_entry/
-- reverse_journal_entry yang sudah ada.
create or replace function public.set_journal_entry_payment_method(
  p_entry_id uuid,
  p_payment_method text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
begin
  if p_payment_method not in ('tunai', 'transfer') then
    raise exception 'invalid payment_method';
  end if;

  select business_id into v_business_id
  from public.journal_entries
  where id = p_entry_id;

  if v_business_id is null then
    raise exception 'journal entry not found';
  end if;

  if not private.owns_business(v_business_id) then
    raise exception 'not authorized';
  end if;

  update public.journal_entries
  set payment_method = p_payment_method
  where id = p_entry_id;
end;
$$;

grant execute on function public.set_journal_entry_payment_method(uuid, text) to authenticated;
