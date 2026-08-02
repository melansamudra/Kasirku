-- Multi-tender checkout: ganti p_payment_method + p_received dengan
-- p_payments jsonb (array [{method, amount, received}]).
-- transaction_payments sudah dirancang untuk banyak baris per transaksi
-- sejak awal — migration ini hanya mengajarkan RPC cara menulisnya.

drop function if exists public.checkout_transaction(
  uuid, uuid, jsonb, text, numeric, numeric, text, uuid, uuid[], uuid
);

create or replace function public.checkout_transaction(
  p_business_id     uuid,
  p_cashier_id      uuid,
  p_items           jsonb,   -- [{product_id, qty, disc, disc_type, note?}]
  p_payments        jsonb,   -- [{method, amount, received}]
  p_order_disc      numeric  default 0,
  p_order_disc_type text     default 'pct',
  p_customer_id     uuid     default null,
  p_self_order_ids  uuid[]   default null,
  p_client_ref      uuid     default null
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
  v_line_gross       numeric(12, 2);
  v_disc             numeric(12, 2);
  v_disc_type        text;
  v_item_disc        numeric(12, 2);
  v_note             text;
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

  -- Idempotency: kalau clientRef ini sudah ada, kembalikan transaksi yang sama.
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

  -- Proses setiap item: hitung total, kurangi stok, konsumsi resep.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_qty        := (v_item ->> 'qty')::numeric;
    v_disc       := coalesce((v_item ->> 'disc')::numeric, 0);
    v_disc_type  := coalesce(v_item ->> 'disc_type', 'pct');
    v_note       := v_item ->> 'note';

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
    v_item_disc  := case v_disc_type
      when 'pct' then round(v_line_gross * v_disc / 100)
      else least(v_disc * v_qty, v_line_gross)
    end;

    insert into public.transaction_items (
      transaction_id, product_id, name, category, price, cost, qty, disc, disc_type, note
    ) values (
      v_transaction_id, v_product.id, v_product.name, v_product.category,
      v_product.price, v_product.cost, v_qty, v_disc, v_disc_type, v_note
    );

    update public.products
    set stock = greatest(0, stock - v_qty)
    where id = v_product_id;

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

    v_subtotal_raw    := v_subtotal_raw + v_line_gross;
    v_total_item_disc := v_total_item_disc + v_item_disc;
    v_total_cost      := v_total_cost + v_product.cost * v_qty;
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
  set subtotal_raw    = v_subtotal_raw,
      subtotal        = v_subtotal,
      total_item_disc = v_total_item_disc,
      order_disc_amt  = v_order_disc_amt,
      service         = v_service,
      tax             = v_tax,
      total           = v_total,
      total_cost      = v_total_cost,
      gross_profit    = v_subtotal - v_total_cost
  where id = v_transaction_id;

  -- Simpan setiap cara bayar sebagai baris terpisah di transaction_payments.
  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    v_pay_method   := v_payment ->> 'method';
    v_pay_amount   := coalesce((v_payment ->> 'amount')::numeric, 0);
    v_pay_received := coalesce((v_payment ->> 'received')::numeric, v_pay_amount);

    if v_pay_method is null or length(trim(v_pay_method)) = 0 then
      raise exception 'payment method required';
    end if;

    insert into public.transaction_payments (
      transaction_id, method, amount, received, change
    ) values (
      v_transaction_id,
      v_pay_method,
      v_pay_amount,
      v_pay_received,
      greatest(0, v_pay_received - v_pay_amount)
    );
  end loop;

  if p_self_order_ids is not null and array_length(p_self_order_ids, 1) > 0 then
    update public.self_orders
    set status = 'selesai'
    where id = any(p_self_order_ids)
      and business_id = p_business_id
      and status <> 'selesai';
  end if;

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
  uuid, uuid, jsonb, jsonb, numeric, text, uuid, uuid[], uuid
) to authenticated;
