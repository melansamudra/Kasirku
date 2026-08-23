-- Audit 2026-08-23 nemu: void_transaction() & owner_void_transaction()
-- (batalkan SELURUH transaksi) mengembalikan stok produk & bahan baku
-- pakai qty ASLI dari SEMUA transaction_items/transaction_ingredient_
-- consumption, tanpa peduli item yang sudah dibatalkan duluan lewat
-- void_transaction_item() (yang SUDAH mengembalikan stok item itu saat
-- di-void). Urutan: void 1 item (stok balik) -> lanjut void sisa
-- transaksi (stok balik LAGI untuk item yang sama) = stok bertambah palsu.
--
-- Fix: batasi restore stok produk ke item yang MASIH aktif (voided =
-- false) -- item yang sudah di-void individual dilewati karena stoknya
-- sudah dikembalikan waktu itu. Untuk bahan baku, transaction_ingredient_
-- consumption tidak punya kolom per-item (cuma per transaksi+bahan), jadi
-- tidak bisa dipilah langsung -- dihitung ulang dari product_recipes ×
-- item yang masih aktif, sama persis pola yang sudah dipakai
-- void_transaction_item() sendiri, supaya kedua jalur konsisten dan tidak
-- pernah double-restore.

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
    and ti.voided = false
    and ti.product_id = p.id
    and p.deleted_at is null;

  update public.ingredients i
  set stock = i.stock + sub.total_qty
  from (
    select pr.ingredient_id, sum(pr.qty * ti.qty) as total_qty
    from public.transaction_items ti
    join public.product_recipes pr on pr.product_id = ti.product_id
    where ti.transaction_id = p_transaction_id
      and ti.voided = false
      and pr.ingredient_id is not null
    group by pr.ingredient_id
  ) sub
  where sub.ingredient_id = i.id;

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

create or replace function public.owner_void_transaction(
  p_business_id uuid,
  p_transaction_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx record;
  v_journal_lines jsonb;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  select t.id, t.voided, t.total, t.subtotal, t.service, t.tax, t.total_cost, t.invoice_number, t.date
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
    and ti.voided = false
    and ti.product_id = p.id
    and p.deleted_at is null;

  update public.ingredients i
  set stock = i.stock + sub.total_qty
  from (
    select pr.ingredient_id, sum(pr.qty * ti.qty) as total_qty
    from public.transaction_items ti
    join public.product_recipes pr on pr.product_id = ti.product_id
    where ti.transaction_id = p_transaction_id
      and ti.voided = false
      and pr.ingredient_id is not null
    group by pr.ingredient_id
  ) sub
  where sub.ingredient_id = i.id;

  update public.transactions
  set voided = true,
      voided_at = now(),
      void_reason = nullif(left(trim(p_reason), 200), ''),
      voided_by = null
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
end;
$$;

grant execute on function public.owner_void_transaction(uuid, uuid, text) to authenticated;
