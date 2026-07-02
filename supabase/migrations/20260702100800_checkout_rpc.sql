-- Module 8: checkout as a single atomic RPC. Everything (transaction row,
-- line items, payment row, stock decrement) happens in one Postgres
-- function call, so a failure partway through rolls back everything instead
-- of leaving an orphaned transaction. Price/cost/name/category are always
-- looked up from public.products server-side — never trusted from the
-- client — so a tampered request can't check out at a fake price.

create or replace function public.checkout_transaction(
  p_business_id uuid,
  p_cashier_id uuid,
  p_items jsonb, -- array of {product_id, qty}
  p_payment_method text,
  p_received numeric default null
)
returns table (transaction_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_number text;
  v_seq int;
  v_subtotal numeric(12, 2) := 0;
  v_total_cost numeric(12, 2) := 0;
  v_transaction_id uuid;
  v_item jsonb;
  v_qty numeric(12, 2);
  v_product_id uuid;
  v_product record;
  v_change numeric(12, 2);
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

  if p_payment_method is null or length(trim(p_payment_method)) = 0 then
    raise exception 'payment method required';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'cart is empty';
  end if;

  select count(*) + 1 into v_seq
  from public.transactions t
  where t.business_id = p_business_id
    and t.date::date = current_date;

  v_invoice_number := 'INV-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.transactions (
    business_id, cashier_id, invoice_number, date,
    subtotal_raw, subtotal, total, total_cost, gross_profit
  ) values (
    p_business_id, p_cashier_id, v_invoice_number, now(),
    0, 0, 0, 0, 0
  )
  returning id into v_transaction_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_qty := (v_item ->> 'qty')::numeric;

    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid quantity';
    end if;

    select * into v_product
    from public.products p
    where p.id = v_product_id
      and p.business_id = p_business_id
      and p.deleted_at is null;

    if not found then
      raise exception 'product not found: %', v_product_id;
    end if;

    insert into public.transaction_items (
      transaction_id, product_id, name, category, price, cost, qty
    ) values (
      v_transaction_id, v_product.id, v_product.name, v_product.category,
      v_product.price, v_product.cost, v_qty
    );

    update public.products
    set stock = greatest(0, stock - v_qty)
    where id = v_product_id;

    v_subtotal := v_subtotal + v_product.price * v_qty;
    v_total_cost := v_total_cost + v_product.cost * v_qty;
  end loop;

  update public.transactions
  set subtotal_raw = v_subtotal,
      subtotal = v_subtotal,
      total = v_subtotal,
      total_cost = v_total_cost,
      gross_profit = v_subtotal - v_total_cost
  where id = v_transaction_id;

  v_change := greatest(coalesce(p_received, v_subtotal) - v_subtotal, 0);

  insert into public.transaction_payments (
    transaction_id, method, amount, received, change
  ) values (
    v_transaction_id, p_payment_method, v_subtotal, p_received, v_change
  );

  return query select v_transaction_id, v_invoice_number;
end;
$$;

grant execute on function public.checkout_transaction(uuid, uuid, jsonb, text, numeric) to authenticated;
