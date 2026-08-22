-- Perbaikan dari audit akuntansi menyeluruh 2026-08-23:
--
-- 1) BUG KRITIS: void_transaction() (dipakai kasir lewat PIN manajer, baik
--    dari POS maupun halaman Riwayat Transaksi) kehilangan logika pembalik
--    jurnal saat migration 20260814160000_mirror_lock_blocks_void.sql
--    menulis ulang fungsi ini untuk menambah pengecekan kunci bulan Mirror
--    Accounts -- blok posting jurnal pembalik (yang ADA di versi sebelumnya,
--    20260710140000_ppn_liability.sql, dan yang MASIH ADA di
--    owner_void_transaction/void_transaction_item versi terbaru) tidak
--    ikut disalin ke fungsi ini. Akibatnya sejak 14 Agustus, setiap void
--    transaksi penuh oleh kasir TIDAK membalik Kas & Bank/Pendapatan/HPP di
--    jurnal -- transaksi ditandai voided tapi angkanya tetap "kepakai" di
--    Akuntansi -> Jurnal/Laba Rugi (Akrual)/Neraca. Fix: kembalikan blok
--    posting jurnal pembalik, identik pola owner_void_transaction.
--
-- 2) post_journal_entry() sekarang menerima p_source opsional (default tetap
--    'manual', jadi seluruh pemanggilan lama yang tidak diubah tidak
--    terpengaruh). Dipakai supaya jurnal dari Pembelian/Payroll/Catat
--    Pengeluaran bisa ditandai dengan source yang sesuai (constraint
--    journal_entries_source_check sudah lama mengizinkan 'pembelian',
--    'payroll', 'beban', tapi sebelumnya tidak pernah benar-benar dipakai).
--    Efek sampingnya disengaja: reverse_journal_entry() cuma mengizinkan
--    koreksi untuk source='manual', jadi begitu 3 modul itu source-nya
--    ditandai benar, jurnalnya tidak lagi bisa "dikoreksi" lewat tombol
--    generik di halaman Jurnal Manual (yang tidak tahu-menahu soal status
--    purchases.paid_amount/payslips.paid_at) -- pembetulan harus lewat
--    mekanisme modul masing-masing (voidPurchase, dll).

create or replace function public.void_transaction(
  p_business_id uuid,
  p_transaction_id uuid,
  p_manager_pin text,
  p_reason text default null
)
returns table (voided_by_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_manager record;
  v_tx record;
  v_journal_lines jsonb;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  select c.id, c.name
  into v_manager
  from public.cashiers c
  where c.business_id = p_business_id
    and c.role = 'manajer'
    and c.active
    and c.pin_hash = extensions.crypt(p_manager_pin, c.pin_hash)
  limit 1;

  if not found then
    raise exception 'PIN salah atau tidak memiliki otorisasi';
  end if;

  select t.id, t.voided, t.date, t.total, t.subtotal, t.service, t.tax, t.total_cost, t.invoice_number
  into v_tx
  from public.transactions t
  where t.id = p_transaction_id
    and t.business_id = p_business_id
  for update;

  if not found then
    raise exception 'transaction not found';
  end if;

  if v_tx.voided then
    raise exception 'transaksi sudah dibatalkan';
  end if;

  perform private.assert_mirror_month_unlocked(p_business_id, v_tx.date);

  update public.products p
  set stock = p.stock + ti.qty
  from public.transaction_items ti
  where ti.transaction_id = p_transaction_id
    and ti.product_id = p.id
    and p.deleted_at is null;

  update public.ingredients i
  set stock = i.stock + tic.qty
  from public.transaction_ingredient_consumption tic
  where tic.transaction_id = p_transaction_id
    and tic.ingredient_id = i.id;

  update public.transactions
  set voided = true,
      voided_at = now(),
      void_reason = nullif(left(trim(p_reason), 200), ''),
      voided_by = v_manager.id
  where id = p_transaction_id;

  v_journal_lines := '[]'::jsonb;
  if v_tx.total > 0 then
    v_journal_lines := v_journal_lines || jsonb_build_array(
      jsonb_build_object('account_code', '4-001', 'debit', v_tx.subtotal + v_tx.service, 'credit', 0),
      jsonb_build_object('account_code', '1-001', 'debit', 0, 'credit', v_tx.total)
    );
    if v_tx.tax > 0 then
      v_journal_lines := v_journal_lines || jsonb_build_array(
        jsonb_build_object('account_code', '2-200', 'debit', v_tx.tax, 'credit', 0)
      );
    end if;
  end if;
  if v_tx.total_cost > 0 then
    v_journal_lines := v_journal_lines || jsonb_build_array(
      jsonb_build_object('account_code', '1-200', 'debit', v_tx.total_cost, 'credit', 0),
      jsonb_build_object('account_code', '5-001', 'debit', 0, 'credit', v_tx.total_cost)
    );
  end if;
  if jsonb_array_length(v_journal_lines) >= 2 then
    perform private.post_journal(
      p_business_id, now(), 'Void ' || v_tx.invoice_number, 'void', p_transaction_id, v_journal_lines
    );
  end if;

  return query select v_manager.name;
end;
$$;

grant execute on function public.void_transaction(uuid, uuid, text, text) to authenticated;

create or replace function public.post_journal_entry(
  p_business_id uuid,
  p_date timestamptz,
  p_description text,
  p_lines jsonb, -- array of {account_code, debit, credit}
  p_source text default 'manual'
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
    p_business_id, coalesce(p_date, now()), p_description, coalesce(p_source, 'manual'), null, p_lines
  );

  return v_entry_id;
end;
$$;

grant execute on function public.post_journal_entry(uuid, timestamptz, text, jsonb, text) to authenticated;

-- Backfill retroaktif: transaksi yang SUDAH di-void kasir sejak bug di atas
-- mulai aktif (14 Agustus) sampai sekarang masih salah catat di database --
-- fix di fungsi saja tidak membetulkan data yang sudah kadung tersimpan.
-- Kriteria idempotent: transaksi voided yang PERNAH punya jurnal penjualan
-- asli (source='penjualan') tapi BELUM PERNAH punya jurnal pembalik
-- (source='void') -- aman dijalankan ulang, tidak akan dobel post untuk
-- transaksi yang sudah benar (owner_void_transaction/void_transaction_item
-- selalu sudah punya baris 'void'-nya).
do $$
declare
  v_tx record;
  v_journal_lines jsonb;
begin
  for v_tx in
    select t.id, t.business_id, t.total, t.subtotal, t.service, t.tax, t.total_cost, t.invoice_number
    from public.transactions t
    where t.voided = true
      and exists (
        select 1 from public.journal_entries je
        where je.source = 'penjualan' and je.source_id = t.id
      )
      and not exists (
        select 1 from public.journal_entries je
        where je.source = 'void' and je.source_id = t.id
      )
  loop
    v_journal_lines := '[]'::jsonb;
    if v_tx.total > 0 then
      v_journal_lines := v_journal_lines || jsonb_build_array(
        jsonb_build_object('account_code', '4-001', 'debit', v_tx.subtotal + v_tx.service, 'credit', 0),
        jsonb_build_object('account_code', '1-001', 'debit', 0, 'credit', v_tx.total)
      );
      if v_tx.tax > 0 then
        v_journal_lines := v_journal_lines || jsonb_build_array(
          jsonb_build_object('account_code', '2-200', 'debit', v_tx.tax, 'credit', 0)
        );
      end if;
    end if;
    if v_tx.total_cost > 0 then
      v_journal_lines := v_journal_lines || jsonb_build_array(
        jsonb_build_object('account_code', '1-200', 'debit', v_tx.total_cost, 'credit', 0),
        jsonb_build_object('account_code', '5-001', 'debit', 0, 'credit', v_tx.total_cost)
      );
    end if;
    if jsonb_array_length(v_journal_lines) >= 2 then
      perform private.post_journal(
        v_tx.business_id, now(), 'Void ' || v_tx.invoice_number || ' (koreksi retroaktif audit)',
        'void', v_tx.id, v_journal_lines
      );
    end if;
  end loop;
end $$;
