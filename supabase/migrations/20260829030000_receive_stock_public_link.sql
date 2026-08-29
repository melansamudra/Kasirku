-- Link publik (tanpa login) buat staf lokasi (Kitchen/Bar/dst) konfirmasi
-- "Terima & Masukkan Stok" untuk barang jalur "Ambil dari Gudang" -- pola
-- persis sama dengan stock_opname_slug/purchase_request_slug (slug per
-- bisnis, lokasi dikunci lewat ?lokasi=<uuid>, staf pilih nama dari
-- dropdown employees, bukan login).
--
-- receive_stock_fulfillment_public() REIMPLEMENTASI logika yang sama
-- dengan receiveStockFulfillment (permintaan-barang/actions.ts) di
-- plpgsql -- sengaja BUKAN action lama dipaksa lewat RPC ini, karena
-- action lama jalan di context businessId+session yang sudah authenticated
-- (tidak butuh slug). Dashboard tetap pakai action lama apa adanya, RPC
-- ini murni buat halaman publik baru /terima-barang/[slug] -- keduanya
-- jalan berdampingan (pola sama seperti Stok Opname: form admin manual +
-- link publik).
alter table public.businesses add column receive_stock_slug text unique;

update public.businesses
set receive_stock_slug = encode(extensions.gen_random_bytes(9), 'hex')
where receive_stock_slug is null;

create or replace function public.get_receive_stock_info(p_slug text, p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_location record;
  v_employees jsonb;
  v_pending jsonb;
begin
  select id, name into v_business
  from public.businesses
  where receive_stock_slug = p_slug;

  if not found then
    return null;
  end if;

  select id, name into v_location
  from public.stock_locations
  where id = p_location_id and business_id = v_business.id;

  if not found then
    return jsonb_build_object('business_name', v_business.name, 'location', null);
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name) order by e.name asc),
    '[]'::jsonb
  )
  into v_employees
  from public.employees e
  where e.business_id = v_business.id and e.active = true;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', f.id,
        'item_name', pri.item_name,
        'unit', pri.unit,
        'qty', f.qty,
        'marked_at', f.marked_at
      )
      order by f.marked_at asc
    ),
    '[]'::jsonb
  )
  into v_pending
  from public.purchase_request_item_stock_fulfillments f
  join public.purchase_request_items pri on pri.id = f.purchase_request_item_id
  join public.purchase_requests pr on pr.id = pri.purchase_request_id
  where f.business_id = v_business.id
    and f.received_at is null
    and pr.location_id = p_location_id;

  return jsonb_build_object(
    'business_name', v_business.name,
    'location', jsonb_build_object('id', v_location.id, 'name', v_location.name),
    'employees', v_employees,
    'pending', v_pending
  );
end;
$$;

grant execute on function public.get_receive_stock_info(text, uuid) to anon, authenticated;

create or replace function public.receive_stock_fulfillment_public(
  p_slug text,
  p_fulfillment_id uuid,
  p_employee_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_employee record;
  v_fulfillment record;
  v_item record;
  v_dest_location_id uuid;
  v_qty numeric(12, 2);
  v_source_stock_before numeric(12, 2);
begin
  select id into v_business_id from public.businesses where receive_stock_slug = p_slug;
  if v_business_id is null then
    raise exception 'business not found';
  end if;

  select id, name into v_employee
  from public.employees
  where id = p_employee_id and business_id = v_business_id and active = true;
  if not found then
    raise exception 'employee not found';
  end if;

  select id, purchase_request_item_id, source_location_id, qty, received_at
  into v_fulfillment
  from public.purchase_request_item_stock_fulfillments
  where id = p_fulfillment_id and business_id = v_business_id;
  if not found then
    raise exception 'fulfillment not found';
  end if;
  if v_fulfillment.received_at is not null then
    raise exception 'already received';
  end if;

  select id, item_name, unit, ingredient_id, purchase_request_id
  into v_item
  from public.purchase_request_items
  where id = v_fulfillment.purchase_request_item_id;
  if not found or v_item.ingredient_id is null then
    raise exception 'item not found';
  end if;

  select location_id into v_dest_location_id
  from public.purchase_requests
  where id = v_item.purchase_request_id;
  if v_dest_location_id is null then
    raise exception 'no destination location';
  end if;

  v_qty := v_fulfillment.qty;

  select stock into v_source_stock_before
  from public.ingredient_location_stock
  where location_id = v_fulfillment.source_location_id and ingredient_id = v_item.ingredient_id;
  v_source_stock_before := coalesce(v_source_stock_before, 0);

  -- Wajib dicek (bukan cuma floor ke 0 lalu tetap kredit lokasi tujuan
  -- penuh) -- sama seperti receiveStockFulfillment versi dashboard, cegah
  -- stok "muncul dari udara".
  if v_source_stock_before < v_qty - 0.000001 then
    raise exception 'insufficient stock';
  end if;

  update public.ingredient_location_stock
  set stock = v_source_stock_before - v_qty
  where location_id = v_fulfillment.source_location_id and ingredient_id = v_item.ingredient_id;

  insert into public.ingredient_location_stock (business_id, location_id, ingredient_id, stock)
  values (v_business_id, v_dest_location_id, v_item.ingredient_id, v_qty)
  on conflict (location_id, ingredient_id)
  do update set stock = public.ingredient_location_stock.stock + excluded.stock;

  update public.purchase_request_item_stock_fulfillments
  set received_at = now(), received_by = v_employee.name
  where id = p_fulfillment_id;

  insert into public.stock_adjustments
    (business_id, ingredient_id, location_id, item_name, unit, stock_before, stock_after, diff, reason)
  values
    (v_business_id, v_item.ingredient_id, v_fulfillment.source_location_id, v_item.item_name, v_item.unit,
     v_source_stock_before, v_source_stock_before - v_qty, -v_qty,
     'Diambil untuk Permintaan Barang (diterima oleh ' || v_employee.name || ')');

  insert into public.activity_log (business_id, type, status, title, detail)
  values (
    v_business_id, 'produk', 'sukses', 'Stok diterima: ' || v_item.item_name,
    v_qty || ' ' || coalesce(v_item.unit, '') || ' -- oleh ' || v_employee.name
  );

  return jsonb_build_object('item_name', v_item.item_name, 'qty', v_qty);
end;
$$;

grant execute on function public.receive_stock_fulfillment_public(text, uuid, uuid) to anon, authenticated;
