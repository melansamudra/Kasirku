-- Konsumsi bahan baku dari penjualan (checkout_transaction) SELAMA INI cuma
-- motong ingredients.stock GLOBAL, walau bisnisnya multi-lokasi
-- (stock_locations_enabled=true). Akibatnya ingredient_location_stock per
-- lokasi (Kitchen/Bar/dll) tidak pernah ikut kepotong dari penjualan -- cuma
-- berubah lewat pembelian/opname/transfer manual, jadi tidak representatif
-- (dibuktikan langsung di data Llauk: "Air Galon Cleo" ingredients.stock
-- global = 0, padahal ingredient_location_stock di Bar Llauk = 19.047 ml).
--
-- Fitur ini SENGAJA di-gate lewat kolom baru businesses.location_scoped_sales_
-- enabled (default FALSE) -- bukan dari stock_locations_enabled yang sudah
-- ada -- supaya bisnis multi-lokasi yang SUDAH AKTIF sekarang (Adi's Culinary
-- Banyumanik/Pleburan, MERLON, k coffe, dll) TIDAK KENA DAMPAK APAPUN sampai
-- benar-benar diaktifkan manual per bisnis. Rencana rollout: nyalakan dulu
-- khusus Llauk Nusantara buat diuji, baru diperluas kalau sudah terbukti
-- aman. checkout_transaction()/void_transaction() untuk bisnis yang FLAG-nya
-- masih false berjalan PERSIS seperti sebelumnya, tidak ada baris kode lama
-- yang diubah/dihapus -- cuma ditambah cabang baru di dalam kondisi if.
alter table public.businesses
  add column location_scoped_sales_enabled boolean not null default false;

-- Snapshot per transaksi butuh tahu lokasi mana yang kena potong SAAT
-- checkout, supaya void_transaction() bisa balikin ke lokasi yang SAMA PERSIS
-- (bukan nebak ulang dari product_recipes yang bisa saja sudah berubah antara
-- waktu jual dan waktu void).
alter table public.transaction_ingredient_consumption
  add column location_id uuid references public.stock_locations (id) on delete set null;

-- checkout_transaction(): tambah cabang location-scoped, tanpa mengubah satu
-- baris pun dari logika lama (masih selalu jalan juga, termasuk buat bisnis
-- yang flag-nya on -- ingredients.stock global tetap ikut kepotong seperti
-- biasa, supaya tidak ada bagian lain yang tiba-tiba baca angka stale).
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
  v_service              numeric(12, 2) := 0;
  v_tax                  numeric(12, 2) := 0;
  v_total                numeric(12, 2);
  v_total_cost           numeric(12, 2) := 0;
  v_transaction_id       uuid;
  v_item                 jsonb;
  v_payment              jsonb;
  v_qty                  numeric(12, 2);
  v_product_id           uuid;
  v_product               record;
  v_unit_price           numeric(12, 2);
  v_line_gross           numeric(12, 2);
  v_disc                 numeric(12, 2);
  v_disc_type            text;
  v_item_disc            numeric(12, 2);
  v_note                 text;
  v_batch                smallint;
  v_shift_id              uuid;
  v_recipe                record;
  v_table_id              uuid;
  v_journal_lines         jsonb;
  v_pay_method            text;
  v_pay_amount            numeric(12, 2);
  v_pay_received          numeric(12, 2);
  v_production_location_id uuid;
  -- Baru, khusus jalur location_scoped_sales_enabled:
  v_default_location_id    uuid;
  v_consumption_location_id uuid;
  v_location_count          int;
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
        select count(distinct location_id) into v_location_count
        from public.ingredient_location_stock
        where business_id = p_business_id and ingredient_id = v_recipe.ingredient_id and stock > 0;

        if v_location_count = 1 then
          select location_id into v_consumption_location_id
          from public.ingredient_location_stock
          where business_id = p_business_id and ingredient_id = v_recipe.ingredient_id and stock > 0
          limit 1;
        else
          -- 0 lokasi (belum pernah ada stok di manapun) atau >1 lokasi
          -- (ambigu) -- fallback ke lokasi produksi, sama pola dengan BSJ.
          v_consumption_location_id := v_default_location_id;
        end if;
      end if;

      insert into public.transaction_ingredient_consumption (transaction_id, ingredient_id, qty, location_id)
      values (v_transaction_id, v_recipe.ingredient_id, v_recipe.qty * v_qty, v_consumption_location_id)
      on conflict (transaction_id, ingredient_id)
      do update set qty = public.transaction_ingredient_consumption.qty + excluded.qty;

      -- ingredients.stock GLOBAL tetap selalu kepotong (tidak berubah dari
      -- sebelumnya) -- supaya bagian lain yang masih baca kolom ini (mis.
      -- bisnis tanpa lokasi) tidak terdampak sama sekali.
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

  -- Posting jurnal akuntansi (inline, tidak memanggil fungsi eksternal)
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

-- void_transaction(): tambah cabang location-scoped setelah restore
-- ingredients.stock global yang sudah ada (tidak diubah). Baca lokasi dari
-- transaction_ingredient_consumption.location_id yang DICATAT SAAT JUAL --
-- bukan nebak ulang dari product_recipes (yang bisa beda kalau resepnya
-- sempat diedit setelah transaksi ini) -- supaya balik ke lokasi yang
-- benar-benar sama.
--
-- Catatan: ini menangani void transaksi PENUH (void_transaction), belum
-- void_transaction_item (batal 1 item saja) -- kalau nanti Llauk juga pakai
-- void per-item, jalur itu perlu ditambal serupa secara terpisah.
create or replace function public.void_transaction(
  p_business_id uuid,
  p_transaction_id uuid,
  p_manager_pin text,
  p_reason text default null
)
returns table (voided_by_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_manager record;
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

  select c.id, c.name
  into v_manager
  from public.cashiers c
  where c.business_id = p_business_id
    and c.role = 'manajer'
    and c.active
    and c.pin_hash = extensions.crypt(p_manager_pin, c.pin_hash)
  limit 1;

  if not found then
    raise exception 'PIN salah atau tidak memiliki otorisasi';
  end if;

  select t.id, t.voided, t.date, t.total, t.subtotal, t.service, t.tax, t.total_cost, t.invoice_number
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
      voided_by = v_manager.id
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

  return query select v_manager.name;
end;
$$;

grant execute on function public.void_transaction(uuid, uuid, text, text) to authenticated;

select pg_notify('pgrst', 'reload schema');
