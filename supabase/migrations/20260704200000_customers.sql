-- Module: customer/member management. Customers are optional — a
-- transaction can be linked to one at checkout to build purchase history,
-- but walk-in sales without a customer remain fully supported.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  note text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index customers_business_id_idx on public.customers (business_id);
-- Phone only needs to be unique among live (non-deleted) customers of a business.
create unique index customers_business_id_phone_key
  on public.customers (business_id, phone)
  where phone is not null and deleted_at is null;

alter table public.customers enable row level security;

create policy "Owner manages customers of own businesses"
on public.customers for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Link transactions to an (optional) customer -----------------------------

alter table public.transactions
  add column if not exists customer_id uuid references public.customers (id) on delete set null;

create index transactions_customer_id_idx on public.transactions (customer_id);

-- checkout_transaction now accepts an optional customer to attach ---------

drop function if exists public.checkout_transaction(uuid, uuid, jsonb, text, numeric, numeric, text);

create or replace function public.checkout_transaction(
  p_business_id uuid,
  p_cashier_id uuid,
  p_items jsonb, -- array of {product_id, qty, disc, disc_type}
  p_payment_method text,
  p_received numeric default null,
  p_order_disc numeric default 0,
  p_order_disc_type text default 'pct',
  p_customer_id uuid default null
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

  select count(*) + 1 into v_seq
  from public.transactions t
  where t.business_id = p_business_id
    and t.date::date = current_date;

  v_invoice_number := 'INV-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.transactions (
    business_id, shift_id, cashier_id, customer_id, invoice_number, date,
    subtotal_raw, subtotal, total, total_cost, gross_profit
  ) values (
    p_business_id, v_shift_id, p_cashier_id, p_customer_id, v_invoice_number, now(),
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

  return query select v_transaction_id, v_invoice_number;
end;
$$;

grant execute on function public.checkout_transaction(uuid, uuid, jsonb, text, numeric, numeric, text, uuid) to authenticated;
