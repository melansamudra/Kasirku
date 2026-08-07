-- Tandai item mana yang asli (batch 0) dan mana tambahan (batch 1, 2, ...).
-- Diisi dari bon saat checkout agar struk bisa tampilkan separator "Tambahan".
alter table public.transaction_items
  add column if not exists batch smallint not null default 0;

-- Perbarui RPC agar membaca batch dari p_items dan menyimpannya.
create or replace function public.checkout_transaction(
  p_business_id     uuid,
  p_cashier_id      uuid,
  p_items           jsonb,
  p_payments        jsonb,
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
  v_shift_id         uuid;
  v_table_id         uuid;
  v_transaction_id   uuid;
  v_item             jsonb;
  v_product          record;
  v_product_id       uuid;
  v_qty              numeric;
  v_disc             numeric;
  v_disc_type        text;
  v_note             text;
  v_batch            smallint;
  v_line_gross       numeric(12, 2);
  v_item_disc        numeric(12, 2);
  v_recipe           record;
  v_total_cost       numeric(12, 2) := 0;
  v_item_cost        numeric(12, 2);
  v_payment          jsonb;
  v_pay_method       text;
  v_pay_amount       numeric(12, 2);
  v_pay_received     numeric(12, 2);
  v_unit_price       numeric(12, 2);
  v_existing_id      uuid;
begin
  -- Idempotency check
  if p_client_ref is not null then
    select id into v_existing_id
    from public.transactions
    where business_id = p_business_id and client_ref = p_client_ref
    limit 1;
    if found then
      return query
        select t.id, t.invoice_number, true
        from public.transactions t where t.id = v_existing_id;
      return;
    end if;
  end if;

  select * into v_business from public.businesses where id = p_business_id;
  if not found then raise exception 'business not found'; end if;

  select id into v_shift_id
  from public.shifts
  where business_id = p_business_id and closed_at is null
  order by opened_at desc limit 1;
  if not found then raise exception 'no active shift'; end if;

  if p_order_disc_type not in ('pct', 'amt') then
    raise exception 'invalid order discount type';
  end if;
  if p_order_disc is null or p_order_disc < 0
     or (p_order_disc_type = 'pct' and p_order_disc > 100) then
    raise exception 'invalid order discount';
  end if;

  select count(*) + 1 into v_seq
  from public.transactions t
  where t.business_id = p_business_id and t.date::date = current_date;

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

    v_unit_price := coalesce((v_item ->> 'unit_price')::numeric, v_product.price);
    v_line_gross := v_unit_price * v_qty;
    v_item_disc  := case v_disc_type
      when 'pct' then round(v_line_gross * v_disc / 100)
      else least(v_disc * v_qty, v_line_gross)
    end;
    v_item_cost  := coalesce(v_product.cost, 0) * v_qty;

    insert into public.transaction_items (
      transaction_id, product_id, name, category, price, cost, qty, disc, disc_type, note, batch
    ) values (
      v_transaction_id, v_product.id, v_product.name, v_product.category,
      v_unit_price, v_product.cost, v_qty, v_disc, v_disc_type, v_note, v_batch
    );

    update public.products set stock = greatest(0, stock - v_qty) where id = v_product_id;

    for v_recipe in
      select pr.ingredient_id, pr.qty as recipe_qty
      from public.product_recipes pr
      where pr.product_id = v_product_id and pr.ingredient_id is not null
    loop
      insert into public.transaction_ingredient_consumption (transaction_id, ingredient_id, qty)
      values (v_transaction_id, v_recipe.ingredient_id, v_recipe.recipe_qty * v_qty);
      update public.ingredients
      set stock = greatest(0, stock - (v_recipe.recipe_qty * v_qty))
      where id = v_recipe.ingredient_id;
    end loop;

    v_subtotal_raw   := v_subtotal_raw + v_line_gross;
    v_total_item_disc := v_total_item_disc + v_item_disc;
    v_total_cost     := v_total_cost + v_item_cost;
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

  update public.transactions set
    subtotal_raw    = v_subtotal_raw,
    total_item_disc = v_total_item_disc,
    order_disc_amt  = v_order_disc_amt,
    subtotal        = v_subtotal,
    service         = v_service,
    tax             = v_tax,
    total           = v_subtotal + v_service + v_tax,
    total_cost      = v_total_cost,
    gross_profit    = (v_subtotal - v_total_cost)
  where id = v_transaction_id;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    v_pay_method   := v_payment ->> 'method';
    v_pay_amount   := (v_payment ->> 'amount')::numeric;
    v_pay_received := (v_payment ->> 'received')::numeric;
    insert into public.transaction_payments (transaction_id, method, amount, received, change)
    values (
      v_transaction_id, v_pay_method, v_pay_amount, v_pay_received,
      case when v_pay_received is not null then greatest(0, v_pay_received - v_pay_amount) else null end
    );
  end loop;

  if p_self_order_ids is not null then
    update public.self_orders set status = 'selesai'
    where id = any(p_self_order_ids) and business_id = p_business_id;
  end if;

  return query select v_transaction_id, v_invoice_number, false;
end;
$$;
