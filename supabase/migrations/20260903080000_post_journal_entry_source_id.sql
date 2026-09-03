-- Tambah parameter opsional p_source_id ke post_journal_entry -- supaya
-- jurnal Pembelian bisa ditautkan balik ke baris `purchases`-nya, sama
-- seperti transaksi kasir sudah bisa ditautkan ke `transactions` (lihat
-- kas-bank.ts baris ~113-156, yang pakai source_id buat mendeteksi &
-- mengecualikan penjualan yang lagi voided dari Kas Masuk/Keluar).
-- Sebelum ini, SEMUA panggilan post_journal_entry dari purchases/actions.ts
-- selalu kirim source_id null (private.post_journal dipanggil literal
-- dengan `null` di post_journal_entry versi lama) -- jadi Kas & Bank tidak
-- punya cara mengecualikan pembelian yang dibatalkan dari kartu Kas
-- Keluar/Masuk (laporan user 2026-09-03, lihat juga
-- 20260903070000_fix_orphaned_void_purchase_journal.sql untuk kasus
-- konkretnya).
--
-- DROP dulu versi 5-parameter lama -- `create or replace` yang cuma
-- menambah parameter bikin overload baru alih-alih mengganti (pelajaran
-- dari 20260823130000_fix_post_journal_entry_overload.sql), bikin
-- PostgREST bingung pilih kandidat & SEMUA pencatatan jurnal manual gagal.
drop function if exists public.post_journal_entry(uuid, timestamptz, text, jsonb, text);

create or replace function public.post_journal_entry(
  p_business_id uuid,
  p_date timestamptz,
  p_description text,
  p_lines jsonb, -- array of {account_code, debit, credit}
  p_source text default 'manual',
  p_source_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if p_description is null or length(trim(p_description)) = 0 then
    raise exception 'description required';
  end if;

  v_entry_id := private.post_journal(
    p_business_id, coalesce(p_date, now()), p_description, coalesce(p_source, 'manual'), p_source_id, p_lines
  );

  return v_entry_id;
end;
$$;

grant execute on function public.post_journal_entry(uuid, timestamptz, text, jsonb, text, uuid) to authenticated;
