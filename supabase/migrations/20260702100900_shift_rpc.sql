-- Module 9: shift open/close as RPCs, so the cash reconciliation math
-- (expected cash, difference, totals) is computed once in the database
-- instead of being re-derived in the browser and trusted blindly.

create or replace function public.open_shift(
  p_business_id uuid,
  p_cashier_id uuid,
  p_opening_cash numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift_id uuid;
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

  if exists (
    select 1 from public.shifts s
    where s.business_id = p_business_id and s.closed_at is null
  ) then
    raise exception 'a shift is already open for this business';
  end if;

  if p_opening_cash is null or p_opening_cash < 0 then
    raise exception 'invalid opening cash';
  end if;

  insert into public.shifts (business_id, cashier_id, opening_cash, notes)
  values (p_business_id, p_cashier_id, p_opening_cash, p_notes)
  returning id into v_shift_id;

  return v_shift_id;
end;
$$;

grant execute on function public.open_shift(uuid, uuid, numeric, text) to authenticated;

-- Close a shift: tallies non-voided transactions recorded against it, then
-- stamps the shift row with the computed totals and the cash difference.
create or replace function public.close_shift(
  p_shift_id uuid,
  p_closing_cash numeric,
  p_close_notes text default null
)
returns table (
  cash_sales numeric,
  non_cash_sales numeric,
  total_sales numeric,
  expected_cash numeric,
  difference numeric,
  tx_count int,
  void_count int
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_opening_cash numeric(12, 2);
  v_cash_sales numeric(12, 2) := 0;
  v_non_cash_sales numeric(12, 2) := 0;
  v_tx_count int := 0;
  v_void_count int := 0;
begin
  select s.business_id, s.opening_cash into v_business_id, v_opening_cash
  from public.shifts s
  where s.id = p_shift_id and s.closed_at is null;

  if not found then
    raise exception 'shift not found or already closed';
  end if;

  if not private.owns_business(v_business_id) then
    raise exception 'not authorized';
  end if;

  if p_closing_cash is null or p_closing_cash < 0 then
    raise exception 'invalid closing cash';
  end if;

  select
    coalesce(sum(tp.amount) filter (where tp.method = 'Tunai'), 0),
    coalesce(sum(tp.amount) filter (where tp.method != 'Tunai'), 0)
  into v_cash_sales, v_non_cash_sales
  from public.transactions t
  join public.transaction_payments tp on tp.transaction_id = t.id
  where t.shift_id = p_shift_id and not t.voided;

  select
    count(*) filter (where not t.voided),
    count(*) filter (where t.voided)
  into v_tx_count, v_void_count
  from public.transactions t
  where t.shift_id = p_shift_id;

  update public.shifts s
  set closed_at = now(),
      closing_cash = p_closing_cash,
      close_notes = p_close_notes,
      cash_sales = v_cash_sales,
      non_cash_sales = v_non_cash_sales,
      total_sales = v_cash_sales + v_non_cash_sales,
      expected_cash = v_opening_cash + v_cash_sales,
      difference = p_closing_cash - (v_opening_cash + v_cash_sales),
      tx_count = v_tx_count,
      void_count = v_void_count
  where s.id = p_shift_id;

  return query
  select
    v_cash_sales,
    v_non_cash_sales,
    v_cash_sales + v_non_cash_sales,
    v_opening_cash + v_cash_sales,
    p_closing_cash - (v_opening_cash + v_cash_sales),
    v_tx_count,
    v_void_count;
end;
$$;

grant execute on function public.close_shift(uuid, numeric, text) to authenticated;

-- Attach transactions to whichever shift is currently open for the
-- business, looked up server-side (never trusted from the client).
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
  v_shift_id uuid;
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

  select id into v_shift_id
  from public.shifts
  where business_id = p_business_id and closed_at is null
  limit 1;

  if v_shift_id is null then
    raise exception 'no active shift — open a shift before selling';
  end if;

  select count(*) + 1 into v_seq
  from public.transactions t
  where t.business_id = p_business_id
    and t.date::date = current_date;

  v_invoice_number := 'INV-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.transactions (
    business_id, shift_id, cashier_id, invoice_number, date,
    subtotal_raw, subtotal, total, total_cost, gross_profit
  ) values (
    p_business_id, v_shift_id, p_cashier_id, v_invoice_number, now(),
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
