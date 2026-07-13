-- Offline mode (Fase 1, mid-session): saat kasir kehilangan koneksi di
-- tengah jualan, penjualan disimpan lokal (IndexedDB) dan di-retry otomatis
-- begitu online lagi. Retry itu bisa saja mengulang request yang sebenarnya
-- sudah sukses di server tapi responsnya tidak sempat sampai ke browser
-- (koneksi putus persis setelah RPC commit) — tanpa idempotency key, retry
-- itu akan membuat transaksi duplikat. client_ref adalah UUID yang dibuat di
-- browser sekali per penjualan dan dikirim ulang apa adanya setiap retry;
-- kalau sudah ada transaksi dengan client_ref itu, RPC mengembalikan baris
-- yang sudah ada (already_existed = true) alih-alih insert baru.
alter table public.transactions add column client_ref uuid;
create unique index transactions_business_client_ref_uniq
  on public.transactions (business_id, client_ref)
  where client_ref is not null;

alter table public.ticket_transactions add column client_ref uuid;
create unique index ticket_transactions_business_client_ref_uniq
  on public.ticket_transactions (business_id, client_ref)
  where client_ref is not null;

drop function if exists public.checkout_transaction(
  uuid, uuid, jsonb, text, numeric, numeric, text, uuid, uuid[]
);

create or replace function public.checkout_transaction(
  p_business_id uuid,
  p_cashier_id uuid,
  p_items jsonb, -- array of {product_id, qty, disc, disc_type}
  p_payment_method text,
  p_received numeric default null,
  p_order_disc numeric default 0,
  p_order_disc_type text default 'pct',
  p_customer_id uuid default null,
  p_self_order_ids uuid[] default null,
  p_client_ref uuid default null
)
returns table (transaction_id uuid, invoice_number text, already_existed boolean)
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

  if p_client_ref is not null then
    select t.id, t.invoice_number into v_transaction_id, v_invoice_number
    from public.transactions t
    where t.business_id = p_business_id and t.client_ref = p_client_ref;

    if found then
      return query select v_transaction_id, v_invoice_number, true;
      return;
    end if;
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
    subtotal_raw, subtotal, total, total_cost, gross_profit, client_ref
  ) values (
    p_business_id, v_shift_id, p_cashier_id, p_customer_id, v_table_id, v_invoice_number, now(),
    0, 0, 0, 0, 0, p_client_ref
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

  return query select v_transaction_id, v_invoice_number, false;
end;
$$;

grant execute on function public.checkout_transaction(
  uuid, uuid, jsonb, text, numeric, numeric, text, uuid, uuid[], uuid
) to authenticated;

drop function if exists public.checkout_ticket_transaction(
  uuid, uuid, jsonb, text, numeric, uuid
);

create or replace function public.checkout_ticket_transaction(
  p_business_id uuid,
  p_cashier_id uuid,
  p_items jsonb, -- array of {ticket_category_id, manual_numbers: string[]}
  p_payment_method text,
  p_received numeric default null,
  p_member_id uuid default null,
  p_client_ref uuid default null
)
returns table (transaction_id uuid, invoice_number text, already_existed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_member record;
  v_invoice_number text;
  v_seq int;
  v_is_holiday boolean;
  v_subtotal numeric(12, 2) := 0;
  v_service numeric(12, 2) := 0;
  v_tax numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_change numeric(12, 2);
  v_transaction_id uuid;
  v_shift_id uuid;
  v_item jsonb;
  v_category_id uuid;
  v_category record;
  v_manual_numbers jsonb;
  v_manual_number text;
  v_use_member_price boolean := false;
  v_unit_price numeric(12, 2);
  v_qty int;
  v_serial int;
  v_journal_lines jsonb;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if p_client_ref is not null then
    select t.id, t.invoice_number into v_transaction_id, v_invoice_number
    from public.ticket_transactions t
    where t.business_id = p_business_id and t.client_ref = p_client_ref;

    if found then
      return query select v_transaction_id, v_invoice_number, true;
      return;
    end if;
  end if;

  if not exists (
    select 1 from public.cashiers c
    where c.id = p_cashier_id and c.business_id = p_business_id and c.active
  ) then
    raise exception 'invalid cashier';
  end if;

  if p_payment_method is null or length(trim(p_payment_method)) = 0 then
    raise exception 'payment method required';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'cart is empty';
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

  if p_member_id is not null then
    select m.id, m.valid_from, m.valid_until
    into v_member
    from public.members m
    where m.id = p_member_id
      and m.business_id = p_business_id
      and m.deleted_at is null;

    if not found then
      raise exception 'member not found';
    end if;

    if current_date < v_member.valid_from or current_date > v_member.valid_until then
      raise exception 'membership tidak aktif (kadaluarsa atau belum berlaku)';
    end if;

    v_use_member_price := true;
  end if;

  v_is_holiday := extract(dow from current_date) in (0, 6)
    or exists (
      select 1 from public.ticket_holidays h
      where h.business_id = p_business_id and h.holiday_date = current_date
    );

  select count(*) + 1 into v_seq
  from public.ticket_transactions t
  where t.business_id = p_business_id
    and t.date::date = current_date;

  v_invoice_number := 'TIX-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.ticket_transactions (
    business_id, shift_id, cashier_id, member_id, invoice_number, date,
    is_holiday, subtotal, service, tax, total, payment_method, received, change, client_ref
  ) values (
    p_business_id, v_shift_id, p_cashier_id, p_member_id, v_invoice_number, now(),
    v_is_holiday, 0, 0, 0, 0, p_payment_method, p_received, 0, p_client_ref
  )
  returning id into v_transaction_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_category_id := (v_item ->> 'ticket_category_id')::uuid;
    v_manual_numbers := v_item -> 'manual_numbers';

    if v_manual_numbers is null or jsonb_typeof(v_manual_numbers) <> 'array'
      or jsonb_array_length(v_manual_numbers) = 0 then
      raise exception 'manual ticket numbers required for category %', v_category_id;
    end if;

    select * into v_category
    from public.ticket_categories
    where id = v_category_id
      and business_id = p_business_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'ticket category not found: %', v_category_id;
    end if;

    v_qty := jsonb_array_length(v_manual_numbers);

    v_unit_price := case
      when v_use_member_price then v_category.member_price
      when v_category.group_min_qty > 0 and v_category.group_price is not null
        and v_qty >= v_category.group_min_qty then v_category.group_price
      when v_is_holiday then v_category.price_holiday
      else v_category.price_weekday
    end;

    for v_manual_number in select jsonb_array_elements_text(v_manual_numbers)
    loop
      if v_manual_number is null or length(trim(v_manual_number)) = 0 then
        raise exception 'nomor tiket fisik tidak boleh kosong (kategori %)', v_category.name;
      end if;

      v_serial := v_category.next_serial;

      insert into public.ticket_serials (
        ticket_transaction_id, ticket_category_id, business_id,
        serial_no, manual_number, price, is_member_price
      ) values (
        v_transaction_id, v_category_id, p_business_id,
        v_serial, trim(v_manual_number), v_unit_price, v_use_member_price
      );

      v_category.next_serial := v_category.next_serial + 1;
      v_subtotal := v_subtotal + v_unit_price;
    end loop;

    update public.ticket_categories
    set next_serial = v_category.next_serial
    where id = v_category_id;
  end loop;

  if v_business.service_enabled then
    v_service := round(v_subtotal * v_business.service_rate / 100);
  end if;

  if v_business.tax_enabled then
    v_tax := round((v_subtotal + v_service) * v_business.tax_rate / 100);
  end if;

  v_total := v_subtotal + v_service + v_tax;
  v_change := greatest(coalesce(p_received, v_total) - v_total, 0);

  update public.ticket_transactions
  set subtotal = v_subtotal,
      service = v_service,
      tax = v_tax,
      total = v_total,
      change = v_change
  where id = v_transaction_id;

  -- Revenue-only posting — no HPP/Persediaan lines exist for tickets.
  v_journal_lines := '[]'::jsonb;
  if v_total > 0 then
    v_journal_lines := v_journal_lines || jsonb_build_array(
      jsonb_build_object('account_code', '1-001', 'debit', v_total, 'credit', 0),
      jsonb_build_object('account_code', '4-002', 'debit', 0, 'credit', v_subtotal + v_service)
    );
    if v_tax > 0 then
      v_journal_lines := v_journal_lines || jsonb_build_array(
        jsonb_build_object('account_code', '2-200', 'debit', 0, 'credit', v_tax)
      );
    end if;
  end if;
  if jsonb_array_length(v_journal_lines) >= 2 then
    perform private.post_journal(
      p_business_id, now(), 'Penjualan Tiket ' || v_invoice_number, 'penjualan', v_transaction_id, v_journal_lines
    );
  end if;

  return query select v_transaction_id, v_invoice_number, false;
end;
$$;

grant execute on function public.checkout_ticket_transaction(
  uuid, uuid, jsonb, text, numeric, uuid, uuid
) to authenticated;
