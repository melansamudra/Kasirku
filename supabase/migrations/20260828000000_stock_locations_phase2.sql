-- Fase 2 stok per lokasi: tandai lokasi default pembelian & lokasi produksi,
-- sambungkan Permintaan Barang ke lokasi, pensiunkan Gudang lama (Gudang
-- Kering/Basah/Setengah Jadi/Purchasing + Permintaan Gudang) yang sudah
-- digantikan 4 lokasi fisik baru (Gudang Utama/Kitchen Atas/Dapur
-- Produksi/Bar Llauk) -- dicek kosong (0 warehouse_stock, 0
-- warehouse_requests, tidak ada ingredient ditag warehouse_id) dan tidak
-- dipakai bisnis lain (cost_control_enabled cuma Llauk Nusantara).

alter table public.stock_locations
  add column is_default_purchase boolean not null default false,
  add column is_production boolean not null default false;

update public.stock_locations set is_default_purchase = true
  where business_id = 'f7c0509b-d708-45d5-9245-592e50f7cbbe' and name = 'Gudang Utama';
update public.stock_locations set is_production = true
  where business_id = 'f7c0509b-d708-45d5-9245-592e50f7cbbe' and name = 'Dapur Produksi';

-- Permintaan Barang jadi sadar-lokasi (nullable & generic -- bisnis
-- non-cost-control tetap null, tidak terpengaruh).
alter table public.purchase_requests
  add column location_id uuid references public.stock_locations (id) on delete set null;

-- Pembelian ingat lokasi mana yang dikredit, supaya void bisa membalik ke
-- lokasi yang sama persis.
alter table public.purchases
  add column location_id uuid references public.stock_locations (id) on delete set null;

-- ---- Retire Gudang lama ----
-- ingredients.warehouse_id (FK ke warehouses) harus dilepas DULU, baru
-- warehouses boleh di-drop -- urutan kebalik sempat gagal dengan error
-- "cannot drop table warehouses because ... ingredients_warehouse_id_fkey
-- depends on it".
alter table public.ingredients drop column if exists warehouse_id;
drop table if exists public.warehouse_request_items;
drop table if exists public.warehouse_requests;
drop table if exists public.warehouse_stock;
drop table if exists public.warehouses;
alter table public.businesses drop column if exists warehouse_request_slug;
drop function if exists public.get_warehouse_request_info(text);
drop function if exists public.submit_warehouse_request(text, uuid, uuid, text, jsonb);

-- ---- get_purchase_request_info: ikut kirim daftar lokasi (kosong utk
-- bisnis non-cost-control) supaya form publik bisa render dropdown lokasi ----
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
  v_locations jsonb;
begin
  select id, name, business_type, cost_control_enabled
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

  if v_business.cost_control_enabled then
    select coalesce(
      jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) order by l.sort_order asc),
      '[]'::jsonb
    )
    into v_locations
    from public.stock_locations l
    where l.business_id = v_business.id;
  else
    v_locations := '[]'::jsonb;
  end if;

  if v_business.business_type = 'fnb' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'name', i.name,
          'unit', i.unit,
          'stock', i.stock,
          'department', i.department,
          'barcode', i.barcode,
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
        jsonb_build_object('id', p.id, 'name', p.name, 'unit', 'pcs', 'stock', p.stock, 'department', null, 'barcode', p.barcode, 'purchase_units', '[]'::jsonb)
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
    'items', v_items,
    'stock_locations', v_locations
  );
end;
$$;

-- ---- submit_purchase_request: terima p_location_id opsional (diabaikan
-- kalau bukan milik bisnis ini -- backward compatible, default null) ----
create or replace function public.submit_purchase_request(
  p_slug text,
  p_employee_id uuid,
  p_note text,
  p_items jsonb, -- array of {itemId, newItemName, unit, qtyOrdered, currentStock}
  p_location_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_employee record;
  v_location_id uuid;
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

  if p_location_id is not null then
    select id into v_location_id
    from public.stock_locations
    where id = p_location_id and business_id = v_business.id;
  else
    v_location_id := null;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'request is empty';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'too many items';
  end if;

  insert into public.purchase_requests (business_id, employee_id, employee_name, note, status, location_id)
  values (v_business.id, v_employee.id, v_employee.name, nullif(left(trim(p_note), 500), ''), 'baru', v_location_id)
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
