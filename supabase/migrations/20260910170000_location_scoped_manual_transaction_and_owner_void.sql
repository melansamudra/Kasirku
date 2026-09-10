-- Lanjutan 20260910160000: checkout_transaction()/void_transaction() sudah
-- ditambal, tapi Llauk sehari-hari pakai create_manual_transaction() (input
-- manual dari backoffice, tanpa PIN kasir) dan owner_void_transaction()
-- (void tanpa PIN) -- dua RPC TERPISAH yang punya bug konsumsi bahan baku
-- yang SAMA PERSIS (cuma motong ingredients.stock global). Ditambal dengan
-- pola & flag yang sama persis (businesses.location_scoped_sales_enabled) --
-- bisnis dengan flag mati (semua bisnis lain saat ini) tidak terdampak sama
-- sekali, logika lama tidak diubah.

create or replace function public.create_manual_transaction(
  p_business_id uuid,
  p_date timestamptz,
  p_items jsonb, -- array of {product_id, qty}
  p_payment_method text,
  p_received numeric default null,
  p_customer_id uuid default null
)
returns table (transaction_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
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
  v_default_location_id uuid;
  v_consumption_location_id uuid;
  v_location_count int;
  v_loc_stock_before numeric(12, 2);
  v_loc_stock_after numeric(12, 2);
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

  select b.tax_enabled, b.tax_rate, b.service_enabled, b.service_rate, b.location_scoped_sales_enabled
  into v_business
  from public.businesses b
  where b.id = p_business_id;

  if v_business.location_scoped_sales_enabled then
    select sl.id into v_default_location_id
    from public.stock_locations sl
    where sl.business_id = p_business_id and sl.is_production
    limit 1;
  end if;

  select count(*) + 1 into v_seq
  from public.transactions t
  where t.business_id = p_business_id
    and t.date::date = p_date::date
    and t.invoice_number like 'MAN-%';

  v_invoice_number := 'MAN-' || to_char(p_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.transactions (
    business_id, shift_id, cashier_id, customer_id, invoice_number, date,
    subtotal_raw, subtotal, total, total_cost, gross_profit
  ) values (
    p_business_id, null, null, p_customer_id, v_invoice_number, p_date,
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
      v_consumption_location_id := null;

      if v_business.location_scoped_sales_enabled then
        select count(distinct location_id) into v_location_count
        from public.ingredient_location_stock
        where business_id = p_business_id and ingredient_id = v_recipe.ingredient_id and stock > 0;

        if v_location_count = 1 then
          select location_id into v_consumption_location_id
          from public.ingredient_location_stock
          where business_id = p_business_id and ingredient_id = v_recipe.ingredient_id and stock > 0
          limit 1;
        else
          v_consumption_location_id := v_default_location_id;
        end if;
      end if;

      insert into public.transaction_ingredient_consumption (
        transaction_id, ingredient_id, qty, location_id
      ) values (
        v_transaction_id, v_recipe.ingredient_id, v_recipe.recipe_qty * v_qty, v_consumption_location_id
      );

      update public.ingredients
      set stock = greatest(0, stock - (v_recipe.recipe_qty * v_qty))
      where id = v_recipe.ingredient_id;

      if v_consumption_location_id is not null then
        select stock into v_loc_stock_before
        from public.ingredient_location_stock
        where business_id = p_business_id
          and location_id = v_consumption_location_id
          and ingredient_id = v_recipe.ingredient_id;
        v_loc_stock_before := coalesce(v_loc_stock_before, 0);
        v_loc_stock_after := greatest(0, v_loc_stock_before - v_recipe.recipe_qty * v_qty);

        insert into public.ingredient_location_stock (business_id, location_id, ingredient_id, stock, updated_at)
        values (p_business_id, v_consumption_location_id, v_recipe.ingredient_id, v_loc_stock_after, now())
        on conflict (location_id, ingredient_id) do update
        set stock = v_loc_stock_after, updated_at = now();

        insert into public.stock_adjustments
          (business_id, ingredient_id, location_id, item_name, unit, stock_before, stock_after, diff, reason)
        select p_business_id, v_recipe.ingredient_id, v_consumption_location_id, i.name, i.unit,
               v_loc_stock_before, v_loc_stock_after, v_loc_stock_after - v_loc_stock_before, 'Penjualan'
        from public.ingredients i where i.id = v_recipe.ingredient_id;
      end if;
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

grant execute on function public.create_manual_transaction(uuid, timestamptz, jsonb, text, numeric, uuid) to authenticated;

-- owner_void_transaction(): sama pola dengan void_transaction() yang sudah
-- ditambal di migration sebelumnya, cuma tanpa cek PIN manajer.
create or replace function public.owner_void_transaction(
  p_business_id uuid,
  p_transaction_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx record;
  v_business record;
  v_journal_lines jsonb;
  v_mirrored record;
  v_consumption record;
  v_loc_stock_before numeric(12, 2);
  v_loc_stock_after numeric(12, 2);
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  select t.id, t.voided, t.total, t.subtotal, t.service, t.tax, t.total_cost, t.invoice_number, t.date
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

  perform private.assert_mirror_month_unlocked(p_business_id, v_tx.date);

  select b.location_scoped_sales_enabled into v_business
  from public.businesses b where b.id = p_business_id;

  update public.products p
  set stock = p.stock + ti.qty
  from public.transaction_items ti
  where ti.transaction_id = p_transaction_id
    and ti.voided = false
    and ti.product_id = p.id
    and p.deleted_at is null;

  update public.ingredients i
  set stock = i.stock + sub.total_qty
  from (
    select pr.ingredient_id, sum(pr.qty * ti.qty) as total_qty
    from public.transaction_items ti
    join public.product_recipes pr on pr.product_id = ti.product_id
    where ti.transaction_id = p_transaction_id
      and ti.voided = false
      and pr.ingredient_id is not null
    group by pr.ingredient_id
  ) sub
  where sub.ingredient_id = i.id;

  if v_business.location_scoped_sales_enabled then
    for v_consumption in
      select tic.ingredient_id, tic.qty, tic.location_id, i.name, i.unit
      from public.transaction_ingredient_consumption tic
      join public.ingredients i on i.id = tic.ingredient_id
      where tic.transaction_id = p_transaction_id and tic.location_id is not null
    loop
      select stock into v_loc_stock_before
      from public.ingredient_location_stock
      where business_id = p_business_id
        and location_id = v_consumption.location_id
        and ingredient_id = v_consumption.ingredient_id;
      v_loc_stock_before := coalesce(v_loc_stock_before, 0);
      v_loc_stock_after := v_loc_stock_before + v_consumption.qty;

      insert into public.ingredient_location_stock (business_id, location_id, ingredient_id, stock, updated_at)
      values (p_business_id, v_consumption.location_id, v_consumption.ingredient_id, v_loc_stock_after, now())
      on conflict (location_id, ingredient_id) do update
      set stock = v_loc_stock_after, updated_at = now();

      insert into public.stock_adjustments
        (business_id, ingredient_id, location_id, item_name, unit, stock_before, stock_after, diff, reason)
      values (p_business_id, v_consumption.ingredient_id, v_consumption.location_id, v_consumption.name, v_consumption.unit,
              v_loc_stock_before, v_loc_stock_after, v_consumption.qty, 'Void Penjualan');
    end loop;
  end if;

  update public.transactions
  set voided = true,
      voided_at = now(),
      void_reason = nullif(left(trim(p_reason), 200), ''),
      voided_by = null
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

  select dest_transaction_id, dest_business_id into v_mirrored
  from public.mirrored_transactions where source_transaction_id = p_transaction_id;

  if v_mirrored.dest_transaction_id is not null then
    perform public.owner_void_transaction(
      v_mirrored.dest_business_id,
      v_mirrored.dest_transaction_id,
      'Cascade dari void transaksi sumber ' || v_tx.invoice_number
    );
  end if;
end;
$$;

grant execute on function public.owner_void_transaction(uuid, uuid, text) to authenticated;

select pg_notify('pgrst', 'reload schema');
