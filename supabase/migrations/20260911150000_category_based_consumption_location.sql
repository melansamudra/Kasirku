-- Sebelumnya lokasi yang kepotong pas penjualan ditentukan MURNI dari
-- ketersediaan stok bahan (kalau cuma ada di 1 lokasi, potong situ; kalau
-- ambigu/tidak ada, jatuh ke SATU lokasi fallback is_production). Ini bikin
-- bahan yang stoknya sengaja ada di 2 lokasi (mis. Kitchen & Bar sama-sama
-- nyetok Nanas Kupas) jadi TIDAK KEPOTONG SAMA SEKALI kalau bisnisnya tidak
-- punya lokasi is_production (kasus Kota Baru: Kitchen & Bar dua-duanya
-- false) -- arahan user: harusnya kategori PRODUK yang nentuin lokasi
-- (menu kategori "Bar" motong dari Bar), bukan nebak dari stok bahan.
--
-- stock_locations.product_categories (text[], default kosong) -- lokasi
-- "mengklaim" kategori produk mana yang dia layani. Kalau kosong di semua
-- lokasi bisnis itu (kondisi SEMUA bisnis lain saat ini, termasuk Llauk),
-- cabang kategori ini TIDAK PERNAH match, langsung lanjut ke logic lama
-- (stok-based + fallback) -- PERSIS seperti sebelumnya, tidak ada dampak
-- sampai owner benar-benar mengisi kolom ini.
alter table public.stock_locations
  add column product_categories text[] not null default '{}';

-- Dipakai bareng oleh checkout_transaction, create_manual_transaction, dan
-- import_esb_sales_bulk (dulu tiga2nya duplikat blok "count distinct
-- location" yang sama persis) -- diekstrak supaya urutan resolusinya SATU
-- tempat: kategori dulu (kalau ada yang klaim), baru fallback ke stok-based.
create or replace function private.pick_consumption_location(
  p_business_id uuid,
  p_ingredient_id uuid,
  p_product_category text,
  p_default_location_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_location_id uuid;
  v_location_count int;
begin
  if p_product_category is not null then
    select sl.id into v_location_id
    from public.stock_locations sl
    where sl.business_id = p_business_id
      and p_product_category = any(sl.product_categories)
    limit 1;

    if v_location_id is not null then
      return v_location_id;
    end if;
  end if;

  select count(distinct location_id) into v_location_count
  from public.ingredient_location_stock
  where business_id = p_business_id and ingredient_id = p_ingredient_id and stock > 0;

  if v_location_count = 1 then
    select location_id into v_location_id
    from public.ingredient_location_stock
    where business_id = p_business_id and ingredient_id = p_ingredient_id and stock > 0
    limit 1;
    return v_location_id;
  end if;

  return p_default_location_id;
end;
$$;

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
#variable_conflict use_column
declare
  v_business             record;
  v_invoice_number       text;
  v_seq                  int;
  v_subtotal_raw         numeric(12, 2) := 0;
  v_total_item_disc      numeric(12, 2) := 0;
  v_order_disc_amt       numeric(12, 2) := 0;
  v_subtotal             numeric(12, 2);
  v_service               numeric(12, 2) := 0;
  v_tax                   numeric(12, 2) := 0;
  v_total                 numeric(12, 2);
  v_total_cost            numeric(12, 2) := 0;
  v_transaction_id        uuid;
  v_item                  jsonb;
  v_payment                jsonb;
  v_qty                    numeric(12, 2);
  v_product_id             uuid;
  v_product                record;
  v_unit_price             numeric(12, 2);
  v_line_gross             numeric(12, 2);
  v_disc                   numeric(12, 2);
  v_disc_type              text;
  v_item_disc              numeric(12, 2);
  v_note                   text;
  v_batch                  smallint;
  v_shift_id               uuid;
  v_recipe                 record;
  v_table_id               uuid;
  v_journal_lines          jsonb;
  v_pay_method             text;
  v_pay_amount             numeric(12, 2);
  v_pay_received           numeric(12, 2);
  v_production_location_id uuid;
  v_default_location_id    uuid;
  v_consumption_location_id uuid;
  v_loc_stock_before         numeric(12, 2);
  v_loc_stock_after          numeric(12, 2);
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

  select b.tax_enabled, b.tax_rate, b.service_enabled, b.service_rate, b.location_scoped_sales_enabled
  into v_business
  from public.businesses b where b.id = p_business_id;

  if v_business.location_scoped_sales_enabled then
    select sl.id into v_default_location_id
    from public.stock_locations sl
    where sl.business_id = p_business_id and sl.is_production
    limit 1;
  end if;

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
        when v_product.variant_label is not null and v_product.variant_label <> ''
        then ' (' || v_product.variant_label || ')' else '' end,
      v_product.category,
      v_unit_price, v_product.cost, v_qty, v_disc, v_disc_type, v_note, v_batch
    );

    for v_recipe in
      select pr.ingredient_id, pr.qty
      from public.product_recipes pr
      where pr.product_id = v_product_id and pr.ingredient_id is not null
    loop
      v_consumption_location_id := null;

      if v_business.location_scoped_sales_enabled then
        v_consumption_location_id := private.pick_consumption_location(
          p_business_id, v_recipe.ingredient_id, v_product.category, v_default_location_id
        );
      end if;

      insert into public.transaction_ingredient_consumption (transaction_id, ingredient_id, qty, location_id)
      values (v_transaction_id, v_recipe.ingredient_id, v_recipe.qty * v_qty, v_consumption_location_id)
      on conflict (transaction_id, ingredient_id)
      do update set qty = public.transaction_ingredient_consumption.qty + excluded.qty;

      update public.ingredients
      set stock = greatest(0, stock - v_recipe.qty * v_qty)
      where id = v_recipe.ingredient_id;

      if v_consumption_location_id is not null then
        select stock into v_loc_stock_before
        from public.ingredient_location_stock
        where business_id = p_business_id
          and location_id = v_consumption_location_id
          and ingredient_id = v_recipe.ingredient_id;
        v_loc_stock_before := coalesce(v_loc_stock_before, 0);
        v_loc_stock_after := greatest(0, v_loc_stock_before - v_recipe.qty * v_qty);

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

    if v_product.semi_finished_item_id is not null then
      select sl.id into v_production_location_id
      from public.stock_locations sl
      where sl.business_id = p_business_id and sl.is_production
      limit 1;

      if v_production_location_id is null then
        raise exception 'lokasi produksi belum diatur untuk bisnis ini';
      end if;

      update public.semi_finished_item_location_stock
      set stock = stock - v_qty, updated_at = now()
      where location_id = v_production_location_id
        and semi_finished_item_id = v_product.semi_finished_item_id
        and stock >= v_qty;

      if not found then
        raise exception 'stok bahan setengah jadi tidak cukup untuk produk: %', v_product.name;
      end if;
    else
      update public.products
      set stock = greatest(0, stock - v_qty)
      where id = v_product_id;
    end if;

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

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    v_pay_method   := v_payment ->> 'method';
    v_pay_amount   := coalesce((v_payment ->> 'amount')::numeric, 0);
    v_pay_received := coalesce((v_payment ->> 'received')::numeric, v_pay_amount);
    if v_pay_method is null or length(trim(v_pay_method)) = 0 then
      raise exception 'payment method required';
    end if;
    insert into public.transaction_payments (transaction_id, method, amount, received, change)
    values (v_transaction_id, v_pay_method, v_pay_amount, v_pay_received,
            greatest(0, v_pay_received - v_pay_amount));
  end loop;

  if p_self_order_ids is not null and array_length(p_self_order_ids, 1) > 0 then
    update public.self_orders set status = 'selesai'
    where id = any(p_self_order_ids) and business_id = p_business_id and status <> 'selesai';
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

grant execute on function public.checkout_transaction(uuid, uuid, jsonb, jsonb, numeric, text, uuid, uuid[], uuid, text) to authenticated;

create or replace function public.create_manual_transaction(
  p_business_id uuid,
  p_date timestamptz,
  p_items jsonb,
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
        v_consumption_location_id := private.pick_consumption_location(
          p_business_id, v_recipe.ingredient_id, v_product.category, v_default_location_id
        );
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

create or replace function public.import_esb_sales_bulk(
  p_business_id uuid,
  p_transactions jsonb
)
returns table (created int, skipped int, skipped_refs text[])
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_business record;
  v_tx jsonb;
  v_item jsonb;
  v_transaction_id uuid;
  v_invoice_number text;
  v_date timestamptz;
  v_external_ref text;
  v_payment text;
  v_catatan text;
  v_subtotal numeric(12, 2);
  v_item_disc numeric(12, 2);
  v_service numeric(12, 2);
  v_tax numeric(12, 2);
  v_total numeric(12, 2);
  v_total_cost numeric(12, 2);
  v_product_id uuid;
  v_qty numeric(12, 2);
  v_price numeric(12, 2);
  v_product record;
  v_recipe record;
  v_created int := 0;
  v_skipped int := 0;
  v_skipped_refs text[] := '{}';
  v_date_key text;
  v_day_seq int;
  v_date_counts jsonb := '{}'::jsonb;
  v_journal_lines jsonb;
  v_default_location_id uuid;
  v_consumption_location_id uuid;
  v_loc_stock_before numeric(12, 2);
  v_loc_stock_after numeric(12, 2);
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  select b.location_scoped_sales_enabled into v_business
  from public.businesses b where b.id = p_business_id;

  if v_business.location_scoped_sales_enabled then
    select sl.id into v_default_location_id
    from public.stock_locations sl
    where sl.business_id = p_business_id and sl.is_production
    limit 1;
  end if;

  for v_tx in select * from jsonb_array_elements(p_transactions)
  loop
    begin
      v_external_ref := nullif(trim(v_tx ->> 'external_ref'), '');
      v_date := (v_tx ->> 'date')::timestamptz;
      v_payment := coalesce(nullif(trim(v_tx ->> 'payment_method'), ''), 'Lainnya');
      v_catatan := nullif(trim(v_tx ->> 'catatan'), '');
      v_subtotal := coalesce((v_tx ->> 'subtotal')::numeric, 0);
      v_item_disc := coalesce((v_tx ->> 'item_disc')::numeric, 0);
      v_service := coalesce((v_tx ->> 'service')::numeric, 0);
      v_tax := coalesce((v_tx ->> 'tax')::numeric, 0);

      if v_date is null or v_date > now() then
        v_skipped := v_skipped + 1;
        if v_external_ref is not null then
          v_skipped_refs := v_skipped_refs || v_external_ref;
        end if;
        continue;
      end if;

      if v_external_ref is not null and exists (
        select 1 from public.transactions t
        where t.business_id = p_business_id and t.external_ref = v_external_ref
      ) then
        v_skipped := v_skipped + 1;
        v_skipped_refs := v_skipped_refs || v_external_ref;
        continue;
      end if;

      if v_tx -> 'items' is null or jsonb_array_length(v_tx -> 'items') = 0 then
        v_skipped := v_skipped + 1;
        if v_external_ref is not null then
          v_skipped_refs := v_skipped_refs || v_external_ref;
        end if;
        continue;
      end if;

      v_date_key := to_char(v_date at time zone 'Asia/Jakarta', 'YYYYMMDD');
      if v_date_counts ? v_date_key then
        v_day_seq := (v_date_counts ->> v_date_key)::int + 1;
      else
        select coalesce(max((regexp_match(invoice_number, 'ESB-\d{8}-(\d+)'))[1]::int), 0) + 1
        into v_day_seq
        from public.transactions
        where business_id = p_business_id
          and (date at time zone 'Asia/Jakarta')::date = (v_date at time zone 'Asia/Jakarta')::date
          and invoice_number like 'ESB-%';
      end if;
      v_date_counts := jsonb_set(v_date_counts, array[v_date_key], to_jsonb(v_day_seq));
      v_invoice_number := 'ESB-' || v_date_key || '-' || lpad(v_day_seq::text, 4, '0');

      insert into public.transactions (
        business_id, shift_id, cashier_id, customer_id, invoice_number, date,
        subtotal_raw, subtotal, service, tax, total_item_disc, total, total_cost, gross_profit,
        catatan, external_ref
      ) values (
        p_business_id, null, null, null, v_invoice_number, v_date,
        0, 0, 0, 0, 0, 0, 0, 0,
        v_catatan, v_external_ref
      )
      returning id into v_transaction_id;

      v_total_cost := 0;

      for v_item in select * from jsonb_array_elements(v_tx -> 'items')
      loop
        v_product_id := (v_item ->> 'product_id')::uuid;
        v_qty := (v_item ->> 'qty')::numeric;
        v_price := (v_item ->> 'price')::numeric;

        if v_product_id is null or v_qty is null or v_qty <= 0 then
          continue;
        end if;

        select * into v_product
        from public.products p
        where p.id = v_product_id and p.business_id = p_business_id and p.deleted_at is null;

        if not found then
          continue;
        end if;

        insert into public.transaction_items (
          transaction_id, product_id, name, category, price, cost, qty, disc, disc_type
        ) values (
          v_transaction_id, v_product.id, v_product.name, v_product.category,
          coalesce(v_price, v_product.price), v_product.cost, v_qty, 0, 'pct'
        );

        update public.products set stock = greatest(0, stock - v_qty) where id = v_product_id;

        for v_recipe in
          select pr.ingredient_id, pr.qty as recipe_qty
          from public.product_recipes pr
          where pr.product_id = v_product_id and pr.ingredient_id is not null
        loop
          v_consumption_location_id := null;

          if v_business.location_scoped_sales_enabled then
            v_consumption_location_id := private.pick_consumption_location(
              p_business_id, v_recipe.ingredient_id, v_product.category, v_default_location_id
            );
          end if;

          insert into public.transaction_ingredient_consumption (transaction_id, ingredient_id, qty, location_id)
          values (v_transaction_id, v_recipe.ingredient_id, v_recipe.recipe_qty * v_qty, v_consumption_location_id);

          update public.ingredients set stock = greatest(0, stock - (v_recipe.recipe_qty * v_qty))
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

        v_total_cost := v_total_cost + v_product.cost * v_qty;
      end loop;

      v_total := greatest(v_subtotal - v_item_disc + v_service + v_tax, 0);

      update public.transactions
      set subtotal_raw = v_subtotal,
          subtotal = v_subtotal - v_item_disc,
          service = v_service,
          tax = v_tax,
          total_item_disc = v_item_disc,
          total = v_total,
          total_cost = v_total_cost,
          gross_profit = (v_subtotal - v_item_disc) - v_total_cost
      where id = v_transaction_id;

      insert into public.transaction_payments (transaction_id, method, amount, received, change)
      values (v_transaction_id, v_payment, v_total, v_total, 0);

      v_journal_lines := '[]'::jsonb;
      if v_total > 0 then
        v_journal_lines := v_journal_lines || jsonb_build_array(
          jsonb_build_object('account_code', '1-001', 'debit', v_total, 'credit', 0),
          jsonb_build_object('account_code', '4-001', 'debit', 0, 'credit', v_subtotal - v_item_disc + v_service)
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
          p_business_id, v_date, 'Impor ESB ' || v_invoice_number, 'penjualan', v_transaction_id, v_journal_lines
        );
      end if;

      v_created := v_created + 1;
    exception when others then
      v_skipped := v_skipped + 1;
      if v_external_ref is not null then
        v_skipped_refs := v_skipped_refs || v_external_ref;
      end if;
    end;
  end loop;

  return query select v_created, v_skipped, v_skipped_refs;
end;
$$;

grant execute on function public.import_esb_sales_bulk(uuid, jsonb) to authenticated;

select pg_notify('pgrst', 'reload schema');
