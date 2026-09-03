-- Impor "Sales Recapitulation Detail Report" dari POS pihak ketiga ESB --
-- laporan detail PER BARIS MENU (beda dari import_sales_recap yang sudah
-- ada, yang cuma terima 5 kolom sederhana Tanggal/Menu/Kategori/Harga/Qty
-- tanpa tax/service/jam). RPC baru ini terima array transaksi yang sudah
-- dikelompokkan per "Sales Number" ESB di sisi Next.js (esb-actions.ts),
-- lengkap dengan item per menu, harga ASLI dari ESB (bukan harga produk
-- saat ini), tax & service yang SUDAH dihitung ESB (bukan dihitung ulang
-- dari businesses.tax_rate/service_rate), dan jam transaksi presisi
-- (bukan cuma tanggal seperti import_sales_recap). Sekaligus potong stok
-- produk & bahan baku lewat product_recipes, sama seperti
-- create_manual_transaction.
--
-- external_ref (Sales Number ESB) dipakai buat cegah dobel impor kalau
-- file yang sama ke-upload 2x -- baris yang external_ref-nya sudah ada
-- untuk business ini dilewati (dihitung sebagai skipped, bukan error).

alter table public.transactions
  add column if not exists external_ref text;

create unique index if not exists transactions_business_external_ref_idx
  on public.transactions (business_id, external_ref)
  where external_ref is not null;

create or replace function public.import_esb_sales_bulk(
  p_business_id uuid,
  p_transactions jsonb
)
returns table (created int, skipped int, skipped_refs text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
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
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
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

      -- Nomor urut invoice per tanggal, prefix ESB- biar kelihatan asalnya
      -- dari impor ini (beda dari MAN- transaksi manual / rekap biasa).
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
          insert into public.transaction_ingredient_consumption (transaction_id, ingredient_id, qty)
          values (v_transaction_id, v_recipe.ingredient_id, v_recipe.recipe_qty * v_qty);

          update public.ingredients set stock = greatest(0, stock - (v_recipe.recipe_qty * v_qty))
          where id = v_recipe.ingredient_id;
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

      -- Sama seperti create_manual_transaction: PPN dipisah ke akun
      -- liability 2-200, TIDAK digabung ke Pendapatan 4-001.
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
