-- Tambah kolom catatan pada tabel transactions untuk menyimpan
-- keterangan bebas (mis. daftar menu dari impor Moka POS).
-- Kolom bersifat opsional (nullable) — tidak mempengaruhi transaksi
-- yang sudah ada maupun alur kasir normal.

alter table public.transactions
add column if not exists catatan text;

-- Update RPC create_manual_transaction dengan parameter catatan opsional.
-- Drop dulu karena penambahan parameter mengubah signature fungsi.
drop function if exists public.create_manual_transaction(uuid, timestamptz, jsonb, text, numeric, uuid);

create or replace function public.create_manual_transaction(
  p_business_id uuid,
  p_date timestamptz,
  p_items jsonb,
  p_payment_method text,
  p_received numeric default null,
  p_customer_id uuid default null,
  p_catatan text default null
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
  v_subtotal numeric(12, 2) := 0;
  v_service numeric(12, 2) := 0;
  v_tax numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_total_cost numeric(12, 2) := 0;
  v_transaction_id uuid;
  v_item jsonb;
  v_qty numeric(12, 2);
  v_product_id uuid;
  v_product record;
  v_change numeric(12, 2);
  v_recipe record;
  v_journal_lines jsonb;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if p_date is null or p_date > now() then
    raise exception 'invalid date';
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

  select b.tax_enabled, b.tax_rate, b.service_enabled, b.service_rate
  into v_business
  from public.businesses b
  where b.id = p_business_id;

  select count(*) + 1 into v_seq
  from public.transactions t
  where t.business_id = p_business_id
    and t.date::date = p_date::date
    and t.invoice_number like 'MAN-%';

  v_invoice_number := 'MAN-' || to_char(p_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.transactions (
    business_id, shift_id, cashier_id, customer_id, invoice_number, date,
    subtotal_raw, subtotal, total, total_cost, gross_profit, catatan
  ) values (
    p_business_id, null, null, p_customer_id, v_invoice_number, p_date,
    0, 0, 0, 0, 0, p_catatan
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
      transaction_id, product_id, name, category, price, cost, qty, disc, disc_type
    ) values (
      v_transaction_id, v_product.id, v_product.name, v_product.category,
      v_product.price, v_product.cost, v_qty, 0, 'pct'
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

    v_subtotal := v_subtotal + v_product.price * v_qty;
    v_total_cost := v_total_cost + v_product.cost * v_qty;
  end loop;

  if v_business.service_enabled then
    v_service := round(v_subtotal * v_business.service_rate / 100);
  end if;

  if v_business.tax_enabled then
    v_tax := round((v_subtotal + v_service) * v_business.tax_rate / 100);
  end if;

  v_total := v_subtotal + v_service + v_tax;

  update public.transactions
  set subtotal_raw = v_subtotal,
      subtotal = v_subtotal,
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
      p_business_id, p_date, 'Transaksi Manual ' || v_invoice_number, 'penjualan', v_transaction_id, v_journal_lines
    );
  end if;

  return query select v_transaction_id, v_invoice_number;
end;
$$;

grant execute on function public.create_manual_transaction(uuid, timestamptz, jsonb, text, numeric, uuid, text) to authenticated;
