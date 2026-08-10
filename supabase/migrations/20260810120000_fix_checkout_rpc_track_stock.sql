-- Hotfix: hapus kondisi track_stock yang tidak ada di tabel products.
-- Referensi yang benar dari 20260807130000_fix_checkout_rpc.sql:
-- update public.products set stock = ... where id = v_product_id; (tanpa kondisi tambahan)

create or replace function public.checkout_transaction(
  p_business_id     uuid,
  p_cashier_id      uuid,
  p_items           jsonb,
  p_payments        jsonb,
  p_order_disc      numeric  default 0,
  p_order_disc_type text     default 'pct',
  p_customer_id     uuid     default null,
  p_self_order_ids  uuid[]   default null,
  p_client_ref      uuid     default null,
  p_order_type      text     default null
)
returns table (transaction_id uuid, invoice_number text, already_existed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business         record;
  v_invoice_number   text;
  v_seq              int;
  v_subtotal_raw     numeric(12, 2) := 0;
  v_total_item_disc  numeric(12, 2) := 0;
  v_order_disc_amt   numeric(12, 2) := 0;
  v_subtotal         numeric(12, 2);
  v_service          numeric(12, 2) := 0;
  v_tax              numeric(12, 2) := 0;
  v_total            numeric(12, 2);
  v_total_cost       numeric(12, 2) := 0;
  v_transaction_id   uuid;
  v_item             jsonb;
  v_payment          jsonb;
  v_qty              numeric(12, 2);
  v_product_id       uuid;
  v_product          record;
  v_unit_price       numeric(12, 2);
  v_line_gross       numeric(12, 2);
  v_disc             numeric(12, 2);
  v_disc_type        text;
  v_item_disc        numeric(12, 2);
  v_note             text;
  v_batch            smallint;
  v_shift_id         uuid;
  v_recipe           record;
  v_table_id         uuid;
  v_journal_lines    jsonb;
  v_pay_method       text;
  v_pay_amount       numeric(12, 2);
  v_pay_received     numeric(12, 2);
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
  ) then raise exception 'invalid cashier'; end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.business_id = p_business_id and c.deleted_at is null
  ) then raise exception 'invalid customer'; end if;

  if p_self_order_ids is not null and exists (
    select 1 from public.self_orders so
    where so.id = any(p_self_order_ids) and so.business_id <> p_business_id
  ) then raise exception 'invalid self order'; end if;

  if p_payments is null or jsonb_array_length(p_payments) = 0 then
    raise exception 'at least one payment required';
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
  from public.businesses b where b.id = p_business_id;

  select id into v_shift_id
  from public.shifts
  where business_id = p_business_id and closed_at is null
  limit 1;

  if v_shift_id is null then
    raise exception 'no active shift — open a shift before selling';
  end if;

  if p_self_order_ids is not null and array_length(p_self_order_ids, 1) > 0 then
    select table_id into v_table_id
    from public.self_orders where id = p_self_order_ids[1];
  end if;

  select count(*) + 1 into v_seq
  from public.transactions t
  where t.business_id = p_business_id and t.date::date = current_date;

  v_invoice_number := 'INV-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.transactions (
    business_id, shift_id, cashier_id, customer_id, table_id, invoice_number, date,
    subtotal_raw, subtotal, total, total_cost, gross_profit, client_ref, order_type
  ) values (
    p_business_id, v_shift_id, p_cashier_id, p_customer_id, v_table_id, v_invoice_number, now(),
    0, 0, 0, 0, 0, p_client_ref, p_order_type
  )
  returning id into v_transaction_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_qty        := (v_item ->> 'qty')::numeric;
    v_disc       := coalesce((v_item ->> 'disc')::numeric, 0);
    v_disc_type  := coalesce(v_item ->> 'disc_type', 'pct');
    v_note       := v_item ->> 'note';
    v_batch      := coalesce((v_item ->> 'batch')::smallint, 0);

    if v_qty is null or v_qty <= 0 then raise exception 'invalid quantity'; end if;
    if v_disc_type not in ('pct', 'amt') then raise exception 'invalid item discount type'; end if;
    if v_disc < 0 or (v_disc_type = 'pct' and v_disc > 100) then raise exception 'invalid item discount'; end if;

    select * into v_product
    from public.products p
    where p.id = v_product_id and p.business_id = p_business_id and p.deleted_at is null;

    if not found then raise exception 'product not found: %', v_product_id; end if;

    v_unit_price := coalesce(
      nullif((v_item ->> 'unit_price')::numeric, 0),
      v_product.price
    );

    v_line_gross := v_unit_price * v_qty;
    v_item_disc  := case v_disc_type
      when 'pct' then round(v_line_gross * v_disc / 100)
      else least(v_disc * v_qty, v_line_gross)
    end;

    insert into public.transaction_items (
      transaction_id, product_id, name, category, price, cost, qty, disc, disc_type, note, batch
    ) values (
      v_transaction_id,
      v_product.id,
      v_product.name || case
        when v_product.variant_label is not null then ' (' || v_product.variant_label || ')' else '' end,
      v_product.category,
      v_unit_price,
      v_product.cost,
      v_qty,
      v_disc,
      v_disc_type,
      v_note,
      v_batch
    );

    -- Recipe consumption
    for v_recipe in
      select pr.ingredient_id, pr.qty
      from public.product_recipes pr
      where pr.product_id = v_product.id and pr.ingredient_id is not null
    loop
      insert into public.transaction_ingredient_consumption (transaction_id, ingredient_id, qty)
      values (v_transaction_id, v_recipe.ingredient_id, v_recipe.qty * v_qty)
      on conflict (transaction_id, ingredient_id)
      do update set qty = public.transaction_ingredient_consumption.qty + excluded.qty;

      update public.ingredients
      set stock = greatest(0, stock - v_recipe.qty * v_qty)
      where id = v_recipe.ingredient_id;
    end loop;

    update public.products
    set stock = greatest(0, stock - v_qty)
    where id = v_product_id;

    v_subtotal_raw    := v_subtotal_raw + v_line_gross;
    v_total_item_disc := v_total_item_disc + v_item_disc;
    v_total_cost      := v_total_cost + v_product.cost * v_qty;
  end loop;

  -- Order-level discount
  v_subtotal := v_subtotal_raw - v_total_item_disc;
  v_order_disc_amt := case p_order_disc_type
    when 'pct' then round(v_subtotal * p_order_disc / 100)
    else least(p_order_disc, v_subtotal)
  end;
  v_subtotal := v_subtotal - v_order_disc_amt;

  if v_business.service_enabled then
    v_service := round(v_subtotal * v_business.service_rate / 100);
  end if;
  if v_business.tax_enabled then
    v_tax := round((v_subtotal + v_service) * v_business.tax_rate / 100);
  end if;
  v_total := v_subtotal + v_service + v_tax;

  update public.transactions
  set subtotal_raw    = v_subtotal_raw,
      subtotal        = v_subtotal,
      service         = v_service,
      tax             = v_tax,
      total           = v_total,
      total_item_disc = v_total_item_disc,
      order_disc_amt  = v_order_disc_amt,
      total_cost      = v_total_cost,
      gross_profit    = v_total - v_total_cost
  where id = v_transaction_id;

  -- Payments
  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    v_pay_method   := v_payment ->> 'method';
    v_pay_amount   := (v_payment ->> 'amount')::numeric;
    v_pay_received := (v_payment ->> 'received')::numeric;
    insert into public.transaction_payments (transaction_id, method, amount, received, change)
    values (
      v_transaction_id,
      v_pay_method,
      v_pay_amount,
      v_pay_received,
      case when v_pay_received is not null then greatest(v_pay_received - v_pay_amount, 0) else null end
    );
  end loop;

  -- Self-order linkage
  if p_self_order_ids is not null and array_length(p_self_order_ids, 1) > 0 then
    update public.self_orders set status = 'selesai'
    where id = any(p_self_order_ids) and business_id = p_business_id;
  end if;

  -- Journal posting
  v_journal_lines := private.build_checkout_journal_lines(
    p_business_id, v_subtotal_raw, v_total_item_disc, v_order_disc_amt,
    v_service, v_tax, v_total, v_total_cost,
    (select jsonb_agg(jsonb_build_object('method', method, 'amount', amount))
     from public.transaction_payments where transaction_id = v_transaction_id)
  );

  if v_journal_lines is not null and jsonb_array_length(v_journal_lines) > 0 then
    perform private.post_journal(
      p_business_id, now(),
      'Penjualan ' || v_invoice_number, 'penjualan', v_transaction_id, v_journal_lines
    );
  end if;

  return query select v_transaction_id, v_invoice_number, false;
end;
$$;

grant execute on function public.checkout_transaction(uuid, uuid, jsonb, jsonb, numeric, text, uuid, uuid[], uuid, text) to authenticated;
