-- Backfill jurnal untuk transaksi manual/impor Moka yang sudah ada SEBELUM
-- migration 20260820090000 (saat itu create_historical_transaction dan
-- import_historical_transactions_bulk belum posting jurnal sama sekali).
-- Tanpa ini, transaksi lama tsb tetap terhitung sebagai omset di Laporan
-- Laba Rugi (baca tabel transactions) tapi hilang dari Jurnal Transaksi &
-- Kas & Bank (baca journal_entries) selamanya.
--
-- Idempotent: hanya memproses transaksi 'MAN-%' yang belum punya
-- journal_entries dengan source='penjualan' & source_id = id transaksi itu,
-- jadi aman dijalankan ulang tanpa duplikasi. Kegagalan per-transaksi (mis.
-- akun 1-001/4-001 belum ke-seed di satu business) tidak menghentikan
-- backfill untuk transaksi/business lain.
do $$
declare
  v_tx record;
  v_done int := 0;
  v_failed int := 0;
begin
  for v_tx in
    select t.id, t.business_id, t.date, t.total, t.invoice_number
    from public.transactions t
    where t.invoice_number like 'MAN-%'
      and t.total > 0
      and not exists (
        select 1 from public.journal_entries je
        where je.source = 'penjualan' and je.source_id = t.id
      )
    order by t.date
  loop
    begin
      perform private.post_journal(
        v_tx.business_id, v_tx.date, 'Penjualan ' || v_tx.invoice_number, 'penjualan', v_tx.id,
        jsonb_build_array(
          jsonb_build_object('account_code', '1-001', 'debit', v_tx.total, 'credit', 0),
          jsonb_build_object('account_code', '4-001', 'debit', 0, 'credit', v_tx.total)
        )
      );
      v_done := v_done + 1;
    exception when others then
      v_failed := v_failed + 1;
      raise notice 'gagal backfill jurnal transaksi %: %', v_tx.invoice_number, sqlerrm;
    end;
  end loop;

  raise notice 'backfill jurnal transaksi manual selesai: % berhasil, % gagal', v_done, v_failed;
end $$;
