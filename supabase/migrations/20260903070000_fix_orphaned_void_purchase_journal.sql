-- Bug ditemukan 2026-09-03 (laporan user): pembelian Llauk Nusantara
-- Rp3.530.000 tanggal 02-09-2026 (id 77a10394-b8ec-4055-888a-7144e564a010,
-- kategori "Lainnya", dibayar tunai penuh) dibatalkan (voided_at
-- 2026-09-03T04:06:01, alasan "salah hutang") lewat voidPurchase
-- (purchases/actions.ts) -- tapi jurnal pembaliknya GAGAL/tidak pernah
-- ke-posting (beda dari pembatalan lain di hari yang sama yang berhasil).
-- Akibatnya Kas & Bank dan Pembelian Llauk overstated Rp3.530.000 (jurnal
-- asli: Debit 5-001 HPP, Kredit 1-001 Kas & Bank -- masih nyangkut walau
-- pembeliannya sudah dianggap batal).
--
-- Catatan: purchases yang dibuat lewat addPurchase TIDAK menyimpan
-- source_id di journal_entries (selalu null, lihat addPurchase/
-- voidPurchase di actions.ts) -- jadi tidak ada cara aman untuk
-- mendeteksi kasus serupa di bisnis lain lewat query otomatis (risiko
-- salah cocok jurnal ke pembelian yang salah). Migration ini SENGAJA
-- cuma membetulkan 1 kasus yang sudah diverifikasi manual di atas, bukan
-- backfill umum seperti pola 20260823100000 untuk void transaksi kasir.
do $$
declare
  v_business_id uuid := 'f7c0509b-d708-45d5-9245-592e50f7cbbe';
  v_purchase_id uuid := '77a10394-b8ec-4055-888a-7144e564a010';
  v_amount numeric := 3530000;
  v_paid_amount numeric := 3530000;
  v_expense_account_code text := '5-001';
begin
  -- Idempotent: cuma jalan kalau pembelian ini memang masih voided DAN
  -- belum pernah ada jurnal koreksi "Batal pembelian: ..." untuk nominal
  -- ini pada tanggal yang sama -- aman dijalankan ulang.
  if exists (
    select 1 from public.purchases
    where id = v_purchase_id and business_id = v_business_id and voided = true
  ) and not exists (
    select 1 from public.journal_entries je
    join public.journal_lines jl on jl.entry_id = je.id
    where je.business_id = v_business_id
      and je.source = 'void'
      and je.date = '2026-09-02'
      and jl.debit = v_amount
      and jl.account_id in (select id from public.accounts where business_id = v_business_id and code = '1-001')
  ) then
    perform private.post_journal(
      v_business_id,
      '2026-09-02'::date,
      'Batal pembelian: Pembelian (koreksi backfill jurnal yang gagal saat void asli)',
      'void',
      null,
      jsonb_build_array(
        jsonb_build_object('account_code', v_expense_account_code, 'debit', 0, 'credit', v_amount),
        jsonb_build_object('account_code', '1-001', 'debit', v_paid_amount, 'credit', 0)
      )
    );
  end if;
end $$;
