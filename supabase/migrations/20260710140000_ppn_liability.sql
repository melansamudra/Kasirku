-- Fix: checkout_transaction credited the full transaction total — including
-- PPN collected from the customer — straight to 4-001 Pendapatan Penjualan.
-- PPN isn't the business's revenue, it's a liability owed to the tax office,
-- so it was overstating income and had nowhere to show up under Kewajiban.
-- Adds a dedicated 2-200 PPN Keluaran (Utang Pajak) account and splits the
-- sale's Kas & Bank debit across Pendapatan Penjualan (subtotal + service)
-- and PPN Keluaran (tax) instead of crediting it all to revenue. Mirrored in
-- void_transaction's reversing entry. Remitting the PPN later (paying it to
-- the tax office) can be recorded as a manual journal entry (debit 2-200,
-- credit 1-001) via the existing Jurnal Manual page — no new UI needed since
-- that page already lists every account dynamically.
create or replace function private.seed_default_accounts(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accounts (business_id, code, name, type, normal_balance, is_system)
  values
    (p_business_id, '1-001', 'Kas & Bank', 'aset', 'debit', true),
    (p_business_id, '1-100', 'Piutang Usaha', 'aset', 'debit', true),
    (p_business_id, '1-200', 'Persediaan', 'aset', 'debit', true),
    (p_business_id, '1-500', 'Peralatan', 'aset', 'debit', true),
    (p_business_id, '2-001', 'Utang Dagang', 'kewajiban', 'kredit', true),
    (p_business_id, '2-100', 'Utang Gaji', 'kewajiban', 'kredit', true),
    (p_business_id, '2-200', 'PPN Keluaran (Utang Pajak)', 'kewajiban', 'kredit', true),
    (p_business_id, '3-001', 'Modal Pemilik', 'modal', 'kredit', true),
    (p_business_id, '3-100', 'Laba Ditahan', 'modal', 'kredit', true),
    (p_business_id, '4-001', 'Pendapatan Penjualan', 'pendapatan', 'kredit', true),
    (p_business_id, '5-001', 'Beban Pokok Penjualan (HPP)', 'beban', 'debit', true),
    (p_business_id, '5-100', 'Beban Gaji', 'beban', 'debit', true),
    (p_business_id, '5-101', 'Beban Listrik & Air', 'beban', 'debit', true),
    (p_business_id, '5-102', 'Beban Sewa', 'beban', 'debit', true),
    (p_business_id, '5-103', 'Beban Marketing', 'beban', 'debit', true),
    (p_business_id, '5-104', 'Beban Perlengkapan', 'beban', 'debit', true),
    (p_business_id, '5-999', 'Beban Lain-lain', 'beban', 'debit', true)
  on conflict (business_id, code) do nothing;
end;
$$;

do $$
declare
  b record;
begin
  for b in select id from public.businesses loop
    perform private.seed_default_accounts(b.id);
  end loop;
end;
$$;

create or replace function public.checkout_transaction(
  p_business_id uuid,
  p_cashier_id uuid,
  p_items jsonb, -- array of {product_id, qty, disc, disc_type}
  p_payment_method text,
  p_received numeric default null,
  p_order_disc numeric default 0,
  p_order_disc_type text default 'pct',
  p_customer_id uuid default null,
  p_self_order_ids uuid[] default null
)
returns table (transaction_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_invoice_number text;
  v_seq int;
  v_subtotal_raw numeric(12, 2) := 0;
  v_total_item_disc numeric(12, 2) := 0;
  v_order_disc_amt numeric(12, 2) := 0;
  v_subtotal numeric(12, 2);
  v_service numeric(12, 2) := 0;
  v_tax numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_total_cost numeric(12, 2) := 0;
  v_transaction_id uuid;
  v_item jsonb;
  v_qty numeric(12, 2);
  v_product_id uuid;
  v_product record;
  v_line_gross numeric(12, 2);
  v_disc numeric(12, 2);
  v_disc_type text;
  v_item_disc numeric(12, 2);
  v_change numeric(12, 2);
  v_shift_id uuid;
  v_recipe record;
  v_table_id uuid;
  v_journal_lines jsonb;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if not exists (
    select 1 from public.cashiers c
    where c.id = p_cashier_id and c.business_id = p_business_id and c.active
  ) then
    raise exception 'invalid cashier';
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.business_id = p_business_id and c.deleted_at is null
  ) then
    raise exception 'invalid customer';
  end if;

  if p_self_order_ids is not null and exists (
    select 1 from public.self_orders so
    where so.id = any(p_self_order_ids) and so.business_id <> p_business_id
  ) then
    raise exception 'invalid self order';
  end if;

  if p_payment_method is null or length(trim(p_payment_method)) = 0 then
    raise exception 'payment method required';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'cart is empty';
  end if;

  if p_order_disc_type not in ('pct', 'amt') then
    raise exception 'invalid order discount type';
  end if;

  if p_order_disc is null or p_order_disc < 0
     or (p_order_disc_type = 'pct' and p_order_disc > 100) then
    raise exception 'invalid order discount';
  end if;

  select b.tax_enabled, b.tax_rate, b.service_enabled, b.service_rate
  into v_business
  from public.businesses b
  where b.id = p_business_id;

  select id into v_shift_id
  from public.shifts
  where business_id = p_business_id and closed_at is null
  limit 1;

  if v_shift_id is null then
    raise exception 'no active shift — open a shift before selling';
  end if;

  if p_self_order_ids is not null and array_length(p_self_order_ids, 1) > 0 then
    select table_id into v_table_id
    from public.self_orders
    where id = p_self_order_ids[1];
  end if;

  select count(*) + 1 into v_seq
  from public.transactions t
  where t.business_id = p_business_id
    and t.date::date = current_date;

  v_invoice_number := 'INV-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.transactions (
    business_id, shift_id, cashier_id, customer_id, table_id, invoice_number, date,
    subtotal_raw, subtotal, total, total_cost, gross_profit
  ) values (
    p_business_id, v_shift_id, p_cashier_id, p_customer_id, v_table_id, v_invoice_number, now(),
    0, 0, 0, 0, 0
  )
  returning id into v_transaction_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_qty := (v_item ->> 'qty')::numeric;
    v_disc := coalesce((v_item ->> 'disc')::numeric, 0);
    v_disc_type := coalesce(v_item ->> 'disc_type', 'pct');

    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid quantity';
    end if;

    if v_disc_type not in ('pct', 'amt') then
      raise exception 'invalid item discount type';
    end if;

    if v_disc < 0 or (v_disc_type = 'pct' and v_disc > 100) then
      raise exception 'invalid item discount';
    end if;

    select * into v_product
    from public.products p
    where p.id = v_product_id
      and p.business_id = p_business_id
      and p.deleted_at is null;

    if not found then
      raise exception 'product not found: %', v_product_id;
    end if;

    v_line_gross := v_product.price * v_qty;
    v_item_disc := case v_disc_type
      when 'pct' then round(v_line_gross * v_disc / 100)
      else least(v_disc * v_qty, v_line_gross)
    end;

    insert into public.transaction_items (
      transaction_id, product_id, name, category, price, cost, qty, disc, disc_type
    ) values (
      v_transaction_id, v_product.id, v_product.name, v_product.category,
      v_product.price, v_product.cost, v_qty, v_disc, v_disc_type
    );

    update public.products
    set stock = greatest(0, stock - v_qty)
    where id = v_product_id;

    -- Consume ingredients per the product's recipe (if any).
    for v_recipe in
      select pr.ingredient_id, pr.qty as recipe_qty
      from public.product_recipes pr
      where pr.product_id = v_product_id and pr.ingredient_id is not null
    loop
      insert into public.transaction_ingredient_consumption (
        transaction_id, ingredient_id, qty
      ) values (
        v_transaction_id, v_recipe.ingredient_id, v_recipe.recipe_qty * v_qty
      );

      update public.ingredients
      set stock = greatest(0, stock - (v_recipe.recipe_qty * v_qty))
      where id = v_recipe.ingredient_id;
    end loop;

    v_subtotal_raw := v_subtotal_raw + v_line_gross;
    v_total_item_disc := v_total_item_disc + v_item_disc;
    v_total_cost := v_total_cost + v_product.cost * v_qty;
  end loop;

  v_order_disc_amt := case p_order_disc_type
    when 'pct' then round((v_subtotal_raw - v_total_item_disc) * p_order_disc / 100)
    else least(p_order_disc, v_subtotal_raw - v_total_item_disc)
  end;

  v_subtotal := v_subtotal_raw - v_total_item_disc - v_order_disc_amt;

  if v_business.service_enabled then
    v_service := round(v_subtotal * v_business.service_rate / 100);
  end if;

  if v_business.tax_enabled then
    v_tax := round((v_subtotal + v_service) * v_business.tax_rate / 100);
  end if;

  v_total := v_subtotal + v_service + v_tax;

  update public.transactions
  set subtotal_raw = v_subtotal_raw,
      subtotal = v_subtotal,
      total_item_disc = v_total_item_disc,
      order_disc_amt = v_order_disc_amt,
      service = v_service,
      tax = v_tax,
      total = v_total,
      total_cost = v_total_cost,
      gross_profit = v_subtotal - v_total_cost
  where id = v_transaction_id;

  v_change := greatest(coalesce(p_received, v_total) - v_total, 0);

  insert into public.transaction_payments (
    transaction_id, method, amount, received, change
  ) values (
    v_transaction_id, p_payment_method, v_total, p_received, v_change
  );

  if p_self_order_ids is not null and array_length(p_self_order_ids, 1) > 0 then
    update public.self_orders
    set status = 'selesai'
    where id = any(p_self_order_ids)
      and business_id = p_business_id
      and status <> 'selesai';
  end if;

  -- Auto-post the sale to the journal: Kas & Bank debited for the full total,
  -- but only (subtotal + service) — the business's actual earnings — is
  -- credited to Pendapatan Penjualan. PPN collected from the customer is
  -- credited to PPN Keluaran (a liability) instead, since it's held on
  -- behalf of the tax office, not revenue. Plus HPP / Persediaan
  -- independently whenever this sale had recipe-based cost data, even on a
  -- 100%-discount sale where v_total is 0 but stock was still consumed.
  v_journal_lines := '[]'::jsonb;
  if v_total > 0 then
    v_journal_lines := v_journal_lines || jsonb_build_array(
      jsonb_build_object('account_code', '1-001', 'debit', v_total, 'credit', 0),
      jsonb_build_object('account_code', '4-001', 'debit', 0, 'credit', v_subtotal + v_service)
    );
    if v_tax > 0 then
      v_journal_lines := v_journal_lines || jsonb_build_array(
        jsonb_build_object('account_code', '2-200', 'debit', 0, 'credit', v_tax)
      );
    end if;
  end if;
  if v_total_cost > 0 then
    v_journal_lines := v_journal_lines || jsonb_build_array(
      jsonb_build_object('account_code', '5-001', 'debit', v_total_cost, 'credit', 0),
      jsonb_build_object('account_code', '1-200', 'debit', 0, 'credit', v_total_cost)
    );
  end if;
  if jsonb_array_length(v_journal_lines) >= 2 then
    perform private.post_journal(
      p_business_id, now(), 'Penjualan ' || v_invoice_number, 'penjualan', v_transaction_id, v_journal_lines
    );
  end if;

  return query select v_transaction_id, v_invoice_number;
end;
$$;

grant execute on function public.checkout_transaction(
  uuid, uuid, jsonb, text, numeric, numeric, text, uuid, uuid[]
) to authenticated;

-- Void: reverse the original sale's journal entry (swap debit/credit),
-- splitting the reversal the same way the original posting was split.
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

  -- Hanya PIN milik manajer aktif dari bisnis ini yang diterima. Pesan error
  -- sengaja tidak membedakan "PIN salah" vs "bukan manajer".
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

  select t.id, t.voided, t.total, t.subtotal, t.service, t.tax, t.total_cost, t.invoice_number
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

  -- Kembalikan stok produk yang terjual (produk yang sudah dihapus dilewati,
  -- sama seperti aplikasi lama).
  update public.products p
  set stock = p.stock + ti.qty
  from public.transaction_items ti
  where ti.transaction_id = p_transaction_id
    and ti.product_id = p.id
    and p.deleted_at is null;

  -- Kembalikan stok bahan baku yang terkonsumsi resep saat checkout.
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
