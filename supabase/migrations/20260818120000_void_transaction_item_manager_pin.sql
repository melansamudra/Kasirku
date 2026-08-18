-- void_transaction_item sebelumnya hanya mengecek private.owns_business(),
-- yang bernilai true untuk SEMUA staf aktif (bukan cuma manajer/owner) --
-- lihat private.owns_business() di 20260726100000_business_staff.sql. Beda
-- dengan void_transaction (void SATU transaksi penuh) yang sudah mewajibkan
-- PIN manajer sejak 20260703100000_void_transaction_rpc.sql, void per-item
-- ini bisa dipanggil kasir mana pun tanpa konfirmasi tambahan -- kasir bisa
-- "menghapus" satu item dari struk yang sudah dibayar (kantongi uangnya,
-- hilangkan dari pembukuan) tanpa sepengetahuan manajer.
--
-- Perbaikan: samakan dengan void_transaction -- owner (sesi terautentikasi
-- sendiri sudah cukup, lihat owner_void_transaction) boleh langsung,
-- selain owner wajib PIN manajer aktif.

-- create or replace can't change a function's parameter list in place --
-- it would leave the OLD 5-arg (no-PIN) signature callable side-by-side as
-- an overload, which defeats the whole point of this migration since
-- PostgREST could still resolve calls to it. Drop it explicitly first.
drop function if exists public.void_transaction_item(uuid, uuid, uuid, text, uuid);

create or replace function public.void_transaction_item(
  p_business_id    uuid,
  p_transaction_id uuid,
  p_item_id        uuid,
  p_reason         text    default null,
  p_cashier_id     uuid    default null,
  p_manager_pin    text    default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx                   record;
  v_item                 record;
  v_is_owner              boolean;
  v_manager               record;
  v_item_gross           numeric(12,2);
  v_item_disc_amt        numeric(12,2);
  v_item_net             numeric(12,2);
  v_base_after_item_disc numeric(12,2);
  v_order_disc_portion   numeric(12,2);
  v_item_subtotal        numeric(12,2);
  v_service_portion      numeric(12,2);
  v_tax_portion          numeric(12,2);
  v_item_total           numeric(12,2);
  v_item_cost            numeric(12,2);
  v_journal_lines        jsonb;
  v_payment_ratio        numeric;
  v_payment              record;
  v_payment_reduce       numeric(12,2);
  v_cash_reduction       numeric(12,2) := 0;
  v_noncash_reduction    numeric(12,2) := 0;
  v_shift_closed         boolean;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  select (b.owner_id = auth.uid()) into v_is_owner
  from public.businesses b
  where b.id = p_business_id;

  if not coalesce(v_is_owner, false) then
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
  end if;

  select ti.id, ti.voided, ti.price, ti.qty, ti.cost,
         ti.disc, ti.disc_type, ti.product_id
  into v_item
  from public.transaction_items ti
  where ti.id = p_item_id
    and ti.transaction_id = p_transaction_id
  for update;

  if not found then
    raise exception 'item tidak ditemukan';
  end if;
  if v_item.voided then
    raise exception 'item sudah di-void';
  end if;

  select t.id, t.voided, t.subtotal_raw, t.total_item_disc, t.order_disc_amt,
         t.subtotal, t.service, t.tax, t.total, t.total_cost, t.gross_profit,
         t.invoice_number, t.shift_id, t.date
  into v_tx
  from public.transactions t
  where t.id = p_transaction_id
    and t.business_id = p_business_id
  for update;

  if not found then
    raise exception 'transaksi tidak ditemukan';
  end if;
  if v_tx.voided then
    raise exception 'transaksi sudah dibatalkan sepenuhnya';
  end if;

  perform private.assert_mirror_month_unlocked(p_business_id, v_tx.date);

  v_item_gross    := v_item.price * v_item.qty;
  v_item_disc_amt := case v_item.disc_type
    when 'pct' then round(v_item_gross * v_item.disc / 100)
    else least(v_item.disc * v_item.qty, v_item_gross)
  end;
  v_item_net := v_item_gross - v_item_disc_amt;

  v_base_after_item_disc := v_tx.subtotal_raw - v_tx.total_item_disc;
  v_order_disc_portion := case
    when v_base_after_item_disc > 0
    then round(v_tx.order_disc_amt * v_item_net / v_base_after_item_disc)
    else 0
  end;

  v_item_subtotal := v_item_net - v_order_disc_portion;

  v_service_portion := case
    when v_tx.subtotal > 0
    then round(v_tx.service * v_item_subtotal / v_tx.subtotal)
    else 0
  end;

  v_tax_portion := case
    when (v_tx.subtotal + v_tx.service) > 0
    then round(v_tx.tax * (v_item_subtotal + v_service_portion)
               / (v_tx.subtotal + v_tx.service))
    else 0
  end;

  v_item_total := v_item_subtotal + v_service_portion + v_tax_portion;
  v_item_cost  := v_item.cost * v_item.qty;

  update public.transaction_items
  set voided      = true,
      void_reason = nullif(left(trim(p_reason), 200), ''),
      voided_at   = now(),
      voided_by   = p_cashier_id
  where id = p_item_id;

  update public.transactions
  set subtotal_raw    = subtotal_raw    - v_item_gross,
      total_item_disc = total_item_disc - v_item_disc_amt,
      order_disc_amt  = order_disc_amt  - v_order_disc_portion,
      subtotal        = subtotal        - v_item_subtotal,
      service         = service         - v_service_portion,
      tax             = tax             - v_tax_portion,
      total           = total           - v_item_total,
      total_cost      = total_cost      - v_item_cost,
      gross_profit    = gross_profit    - (v_item_subtotal - v_item_cost)
  where id = p_transaction_id;

  -- Kurangi transaction_payments proporsional dengan kontribusi item —
  -- kasir mengembalikan uang ke pelanggan saat item di-void, jadi jumlah
  -- yang "sungguh diterima" per metode pembayaran harus ikut turun.
  v_payment_ratio := case when v_tx.total > 0 then v_item_total / v_tx.total else 0 end;
  if v_payment_ratio > 0 then
    for v_payment in
      select id, method, amount
      from public.transaction_payments
      where transaction_id = p_transaction_id
      for update
    loop
      v_payment_reduce := least(v_payment.amount, round(v_payment.amount * v_payment_ratio, 2));
      update public.transaction_payments
      set amount = amount - v_payment_reduce
      where id = v_payment.id;
      if v_payment.method = 'Tunai' then
        v_cash_reduction := v_cash_reduction + v_payment_reduce;
      else
        v_noncash_reduction := v_noncash_reduction + v_payment_reduce;
      end if;
    end loop;
  end if;

  -- Update shift terkait. total_sales selalu diperbarui (shift terbuka:
  -- masih NULL, NULL - x = NULL, aman). Untuk shift yang SUDAH ditutup,
  -- kolom snapshot cash_sales/non_cash_sales/expected_cash/difference juga
  -- perlu disesuaikan karena tidak dihitung ulang secara live lagi.
  if v_tx.shift_id is not null then
    select closed_at is not null into v_shift_closed
    from public.shifts where id = v_tx.shift_id;

    update public.shifts
    set total_sales    = total_sales - v_item_total,
        cash_sales     = case when v_shift_closed then cash_sales - v_cash_reduction else cash_sales end,
        non_cash_sales = case when v_shift_closed then non_cash_sales - v_noncash_reduction else non_cash_sales end,
        expected_cash  = case when v_shift_closed then expected_cash - v_cash_reduction else expected_cash end,
        difference     = case when v_shift_closed then difference + v_cash_reduction else difference end
    where id = v_tx.shift_id;
  end if;

  update public.products
  set stock = stock + v_item.qty
  where id = v_item.product_id
    and deleted_at is null;

  update public.ingredients i
  set stock = i.stock + pr.qty * v_item.qty
  from public.product_recipes pr
  where pr.product_id = v_item.product_id
    and pr.ingredient_id = i.id;

  v_journal_lines := '[]'::jsonb;
  if v_item_total > 0 then
    v_journal_lines := v_journal_lines || jsonb_build_array(
      jsonb_build_object('account_code', '4-001', 'debit', v_item_subtotal + v_service_portion, 'credit', 0),
      jsonb_build_object('account_code', '1-001', 'debit', 0, 'credit', v_item_total)
    );
    if v_tax_portion > 0 then
      v_journal_lines := v_journal_lines || jsonb_build_array(
        jsonb_build_object('account_code', '2-200', 'debit', v_tax_portion, 'credit', 0)
      );
    end if;
  end if;
  if v_item_cost > 0 then
    v_journal_lines := v_journal_lines || jsonb_build_array(
      jsonb_build_object('account_code', '1-200', 'debit', v_item_cost, 'credit', 0),
      jsonb_build_object('account_code', '5-001', 'debit', 0, 'credit', v_item_cost)
    );
  end if;

  if jsonb_array_length(v_journal_lines) >= 2 then
    perform private.post_journal(
      p_business_id,
      now(),
      'Void item ' || v_tx.invoice_number,
      'void',
      p_transaction_id,
      v_journal_lines
    );
  end if;
end;
$$;

grant execute on function public.void_transaction_item(uuid, uuid, uuid, text, uuid, text) to authenticated;
