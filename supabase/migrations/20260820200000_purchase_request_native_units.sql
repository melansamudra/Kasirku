-- Perombakan berdasarkan feedback pemakaian nyata:
-- 1. Order barang (Permintaan Barang) TIDAK LAGI dikonversi ke satuan stok
--    saat masuk — qty & satuan disimpan persis seperti diketik staf (mis.
--    "2 Sak", bukan dipaksa jadi "50000 gram"). Konversi ke satuan stok baru
--    terjadi belakangan, di form Pembelian & Hutang saat barang beneran
--    dicatat (mekanisme toggle satuan yang sudah ada di form itu).
-- 2. Satuan beli per bahan sekarang bisa banyak varian (mis. "Sak Kecil" =
--    5kg, "Sak Besar" = 25kg), bukan cuma satu pasang satuan+konversi.
--    Menggantikan ingredients.purchase_unit/purchase_conversion yang baru
--    ditambahkan (belum ada data produksi yang bergantung ke situ).

alter table public.ingredients
  drop column purchase_unit,
  drop column purchase_conversion;

create table public.ingredient_purchase_units (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  unit_name text not null,
  conversion numeric(12, 4) not null check (conversion > 0),
  created_at timestamptz not null default now(),
  unique (ingredient_id, unit_name)
);

create index ingredient_purchase_units_ingredient_id_idx on public.ingredient_purchase_units (ingredient_id);
create index ingredient_purchase_units_business_id_idx on public.ingredient_purchase_units (business_id);

alter table public.ingredient_purchase_units enable row level security;

create policy "Owner manages ingredient purchase units of own businesses"
on public.ingredient_purchase_units for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- RPC baca form order publik: kirim daftar varian satuan beli per bahan
-- (bukan satu pasang), biar staf bisa pilih salah satu (atau satuan stok
-- langsung kalau tidak ada varian yang cocok).
create or replace function public.get_purchase_request_info(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_employees jsonb;
  v_items jsonb;
begin
  select id, name, business_type
  into v_business
  from public.businesses
  where purchase_request_slug = p_slug;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name) order by e.created_at asc),
    '[]'::jsonb
  )
  into v_employees
  from public.employees e
  where e.business_id = v_business.id and e.active = true;

  if v_business.business_type = 'fnb' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'name', i.name,
          'unit', i.unit,
          'stock', i.stock,
          'purchase_units', (
            select coalesce(
              jsonb_agg(jsonb_build_object('unitName', u.unit_name, 'conversion', u.conversion) order by u.unit_name asc),
              '[]'::jsonb
            )
            from public.ingredient_purchase_units u
            where u.ingredient_id = i.id
          )
        )
        order by i.name asc
      ),
      '[]'::jsonb
    )
    into v_items
    from public.ingredients i
    where i.business_id = v_business.id and i.deleted_at is null;
  else
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', p.id, 'name', p.name, 'unit', 'pcs', 'stock', p.stock, 'purchase_units', '[]'::jsonb)
        order by p.name asc
      ),
      '[]'::jsonb
    )
    into v_items
    from public.products p
    where p.business_id = v_business.id and p.deleted_at is null;
  end if;

  return jsonb_build_object(
    'business_id', v_business.id,
    'business_name', v_business.name,
    'business_type', v_business.business_type,
    'employees', v_employees,
    'items', v_items
  );
end;
$$;

-- RPC tulis: qty & unit dipakai APA ADANYA dari client (tidak dikonversi di
-- sini) — client sekarang selalu kirim `unit` (baik itu satuan stok atau
-- salah satu varian satuan beli) buat item existing, bukan cuma buat item
-- baru seperti sebelumnya.
create or replace function public.submit_purchase_request(
  p_slug text,
  p_employee_id uuid,
  p_note text,
  p_items jsonb -- array of {itemId, newItemName, unit, qtyOrdered, currentStock}
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_employee record;
  v_request_id uuid;
  v_item jsonb;
  v_qty numeric(12, 2);
  v_current_stock numeric(12, 2);
  v_item_id uuid;
  v_item_name text;
  v_unit text;
  v_new_name text;
begin
  select id, business_type
  into v_business
  from public.businesses
  where purchase_request_slug = p_slug;

  if not found then
    raise exception 'business not found';
  end if;

  select id, name
  into v_employee
  from public.employees
  where id = p_employee_id and business_id = v_business.id and active = true;

  if not found then
    raise exception 'employee not found';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'request is empty';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'too many items';
  end if;

  insert into public.purchase_requests (business_id, employee_id, employee_name, note, status)
  values (v_business.id, v_employee.id, v_employee.name, nullif(left(trim(p_note), 500), ''), 'baru')
  returning id into v_request_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'qtyOrdered')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 999999 then
      raise exception 'invalid quantity';
    end if;

    v_current_stock := nullif(v_item ->> 'currentStock', '')::numeric;
    v_new_name := nullif(trim(v_item ->> 'newItemName'), '');
    v_unit := coalesce(nullif(trim(v_item ->> 'unit'), ''), null);

    if v_new_name is not null then
      if v_business.business_type = 'fnb' then
        insert into public.ingredients (business_id, name, unit, stock, min_stock, unit_cost)
        values (v_business.id, left(v_new_name, 200), coalesce(v_unit, 'pcs'), 0, 0, 0)
        returning id, name into v_item_id, v_item_name;

        insert into public.purchase_request_items
          (business_id, purchase_request_id, item_type, ingredient_id, item_name, unit, qty_ordered, current_stock)
        values
          (v_business.id, v_request_id, 'ingredient', v_item_id, v_item_name, coalesce(v_unit, 'pcs'), v_qty, v_current_stock);
      else
        insert into public.products (business_id, name, stock, min_stock, cost, price)
        values (v_business.id, left(v_new_name, 200), 0, 0, 0, 0)
        returning id, name into v_item_id, v_item_name;

        insert into public.purchase_request_items
          (business_id, purchase_request_id, item_type, product_id, item_name, unit, qty_ordered, current_stock)
        values
          (v_business.id, v_request_id, 'product', v_item_id, v_item_name, coalesce(v_unit, 'pcs'), v_qty, v_current_stock);
      end if;
    else
      if v_business.business_type = 'fnb' then
        select id, name into v_item_id, v_item_name
        from public.ingredients
        where id = (v_item ->> 'itemId')::uuid and business_id = v_business.id and deleted_at is null;

        if not found then
          raise exception 'item not found';
        end if;

        insert into public.purchase_request_items
          (business_id, purchase_request_id, item_type, ingredient_id, item_name, unit, qty_ordered, current_stock)
        values
          (v_business.id, v_request_id, 'ingredient', v_item_id, v_item_name, v_unit, v_qty, v_current_stock);
      else
        select id, name into v_item_id, v_item_name
        from public.products
        where id = (v_item ->> 'itemId')::uuid and business_id = v_business.id and deleted_at is null;

        if not found then
          raise exception 'item not found';
        end if;

        insert into public.purchase_request_items
          (business_id, purchase_request_id, item_type, product_id, item_name, unit, qty_ordered, current_stock)
        values
          (v_business.id, v_request_id, 'product', v_item_id, v_item_name, coalesce(v_unit, 'pcs'), v_qty, v_current_stock);
      end if;
    end if;
  end loop;

  return v_request_id;
end;
$$;
