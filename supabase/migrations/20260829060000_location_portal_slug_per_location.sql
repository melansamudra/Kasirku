-- Portal Lokasi: pindah dari 1 slug per BISNIS (+ ?lokasi=<uuid> query param)
-- jadi 1 slug per LOKASI. Sebelumnya semua lokasi (Dapur Produksi, Kitchen,
-- Bar, Purchasing) berbagi SATU slug (businesses.location_portal_slug) --
-- begitu halaman "Staf" dibuka dari lokasi manapun, tombol "Ganti link" di
-- situ mematikan link SEMUA lokasi sekaligus (QR yang sudah dicetak di
-- lokasi lain ikut mati). Sekarang tiap lokasi independen: slug sendiri,
-- ganti link 1 lokasi tidak menyentuh lokasi lain sama sekali.

alter table public.stock_locations add column portal_slug text unique;

-- Backfill: lokasi is_production (Dapur Produksi) mewarisi slug LAMA yang
-- sudah dites/kemungkinan sudah dicetak, supaya link yang sudah beredar
-- tetap hidup. Lokasi lain (belum pernah punya link sendiri) dapat slug
-- baru random.
update public.stock_locations sl
set portal_slug = b.location_portal_slug
from public.businesses b
where sl.business_id = b.id and sl.is_production = true and b.location_portal_slug is not null;

update public.stock_locations
set portal_slug = encode(extensions.gen_random_bytes(9), 'hex')
where portal_slug is null;

alter table public.businesses drop column location_portal_slug;

-- Login portal -- slug sekarang resolve LANGSUNG ke 1 lokasi (bukan ke
-- bisnis lalu divalidasi p_location_id terpisah lagi).
create or replace function public.verify_employee_pin(
  p_slug text,
  p_employee_id uuid,
  p_pin text
)
returns table (employee_id uuid, employee_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_employee record;
begin
  select business_id into v_business_id from public.stock_locations where portal_slug = p_slug;
  if v_business_id is null then
    raise exception 'business not found';
  end if;

  select e.id, e.name, e.pin_hash into v_employee
  from public.employees e
  where e.id = p_employee_id and e.business_id = v_business_id and e.active = true;
  if not found then
    raise exception 'employee not found';
  end if;

  if v_employee.pin_hash is null then
    raise exception 'pin not set';
  end if;

  if v_employee.pin_hash != extensions.crypt(p_pin, v_employee.pin_hash) then
    raise exception 'invalid pin';
  end if;

  return query select v_employee.id, v_employee.name;
end;
$$;

grant execute on function public.verify_employee_pin(text, uuid, text) to anon, authenticated;

-- get_location_portal_home/get_location_portal_transfers dulu butuh p_slug +
-- p_location_id (slug resolve bisnis, location_id resolve lokasi DALAM
-- bisnis itu). Sekarang p_slug sendiri sudah cukup -- drop dulu versi 2-arg
-- lama (CREATE OR REPLACE tidak bisa ganti jumlah parameter).
drop function if exists public.get_location_portal_home(text, uuid);
drop function if exists public.get_location_portal_transfers(text, uuid);

create or replace function public.get_location_portal_home(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location record;
  v_business record;
  v_employees jsonb;
  v_pending_transfer_count int;
  v_pending_receive_count int;
begin
  select id, business_id, name, is_production, is_default_purchase into v_location
  from public.stock_locations
  where portal_slug = p_slug;
  if not found then
    return null;
  end if;

  select id, name, stock_opname_slug, receive_stock_slug, production_scan_slug, purchase_request_slug into v_business
  from public.businesses
  where id = v_location.business_id;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name) order by e.name asc),
    '[]'::jsonb
  )
  into v_employees
  from public.employees e
  where e.business_id = v_business.id and e.location_id = v_location.id and e.active = true;

  select count(*) into v_pending_transfer_count
  from public.location_transfers t
  where t.business_id = v_business.id and t.from_location_id = v_location.id and t.status = 'baru';

  select count(*) into v_pending_receive_count
  from public.purchase_request_item_stock_fulfillments f
  join public.purchase_request_items pri on pri.id = f.purchase_request_item_id
  join public.purchase_requests pr on pr.id = pri.purchase_request_id
  where f.business_id = v_business.id and f.received_at is null and pr.location_id = v_location.id;

  return jsonb_build_object(
    'business_id', v_business.id,
    'business_name', v_business.name,
    'stock_opname_slug', v_business.stock_opname_slug,
    'receive_stock_slug', v_business.receive_stock_slug,
    'production_scan_slug', v_business.production_scan_slug,
    'purchase_request_slug', v_business.purchase_request_slug,
    'location', jsonb_build_object(
      'id', v_location.id,
      'name', v_location.name,
      'is_production', v_location.is_production,
      'is_default_purchase', v_location.is_default_purchase
    ),
    'employees', v_employees,
    'pending_transfer_count', v_pending_transfer_count,
    'pending_receive_count', v_pending_receive_count
  );
end;
$$;

grant execute on function public.get_location_portal_home(text) to anon, authenticated;

create or replace function public.get_location_portal_transfers(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_location_id uuid;
  v_transfers jsonb;
begin
  select business_id, id into v_business_id, v_location_id
  from public.stock_locations where portal_slug = p_slug;
  if v_business_id is null then
    raise exception 'business not found';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'to_location_name', tl.name,
        'requested_by_name', t.requested_by_name,
        'note', t.note,
        'created_at', t.created_at,
        'items', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', i.id,
                'item_name', i.item_name,
                'unit', i.unit,
                'qty_requested', i.qty_requested
              )
              order by i.id
            ),
            '[]'::jsonb
          )
          from public.location_transfer_items i
          where i.transfer_id = t.id
        )
      )
      order by t.created_at asc
    ),
    '[]'::jsonb
  )
  into v_transfers
  from public.location_transfers t
  join public.stock_locations tl on tl.id = t.to_location_id
  where t.business_id = v_business_id and t.from_location_id = v_location_id and t.status = 'baru';

  return jsonb_build_object('transfers', v_transfers);
end;
$$;

grant execute on function public.get_location_portal_transfers(text) to anon, authenticated;

-- fulfill_location_transfer_public: signature (jumlah & urutan param) sama
-- persis, cuma resolusi p_slug-nya diarahkan ke stock_locations.
create or replace function public.fulfill_location_transfer_public(
  p_slug text,
  p_employee_id uuid,
  p_transfer_id uuid,
  p_qty_sent jsonb -- array of {itemId, qty}
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_employee record;
  v_transfer record;
  v_row jsonb;
  v_item record;
  v_qty numeric(12, 2);
  v_source_stock numeric(12, 2);
  v_dest_stock numeric(12, 2);
  v_any_sent boolean := false;
begin
  select business_id into v_business_id from public.stock_locations where portal_slug = p_slug;
  if v_business_id is null then
    raise exception 'business not found';
  end if;

  select id, name into v_employee
  from public.employees
  where id = p_employee_id and business_id = v_business_id and active = true;
  if not found then
    raise exception 'employee not found';
  end if;

  select id, from_location_id, to_location_id, status into v_transfer
  from public.location_transfers
  where id = p_transfer_id and business_id = v_business_id;
  if not found then
    raise exception 'transfer not found';
  end if;
  if v_transfer.status != 'baru' then
    raise exception 'already fulfilled';
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_qty_sent, '[]'::jsonb))
  loop
    v_qty := (v_row ->> 'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      continue;
    end if;

    select id, semi_finished_item_id, item_name, unit into v_item
    from public.location_transfer_items
    where id = (v_row ->> 'itemId')::uuid and transfer_id = p_transfer_id;
    if not found then
      continue;
    end if;

    select stock into v_source_stock
    from public.semi_finished_item_location_stock
    where business_id = v_business_id and location_id = v_transfer.from_location_id
      and semi_finished_item_id = v_item.semi_finished_item_id;
    v_source_stock := coalesce(v_source_stock, 0);
    if v_source_stock < v_qty then
      raise exception 'insufficient stock: %', v_item.item_name;
    end if;

    select stock into v_dest_stock
    from public.semi_finished_item_location_stock
    where business_id = v_business_id and location_id = v_transfer.to_location_id
      and semi_finished_item_id = v_item.semi_finished_item_id;
    v_dest_stock := coalesce(v_dest_stock, 0);

    insert into public.semi_finished_item_location_stock
      (business_id, location_id, semi_finished_item_id, stock, updated_at)
    values (v_business_id, v_transfer.from_location_id, v_item.semi_finished_item_id, v_source_stock - v_qty, now())
    on conflict (location_id, semi_finished_item_id) do update set stock = excluded.stock, updated_at = excluded.updated_at;

    insert into public.semi_finished_item_location_stock
      (business_id, location_id, semi_finished_item_id, stock, updated_at)
    values (v_business_id, v_transfer.to_location_id, v_item.semi_finished_item_id, v_dest_stock + v_qty, now())
    on conflict (location_id, semi_finished_item_id) do update set stock = excluded.stock, updated_at = excluded.updated_at;

    insert into public.stock_adjustments
      (business_id, semi_finished_item_id, location_id, item_name, unit, stock_before, stock_after, diff, reason)
    values
      (v_business_id, v_item.semi_finished_item_id, v_transfer.from_location_id, v_item.item_name, v_item.unit,
       v_source_stock, v_source_stock - v_qty, -v_qty, 'Transfer keluar (portal, oleh ' || v_employee.name || ')'),
      (v_business_id, v_item.semi_finished_item_id, v_transfer.to_location_id, v_item.item_name, v_item.unit,
       v_dest_stock, v_dest_stock + v_qty, v_qty, 'Transfer masuk (portal, oleh ' || v_employee.name || ')');

    update public.location_transfer_items set qty_sent = v_qty where id = v_item.id;
    v_any_sent := true;
  end loop;

  if not v_any_sent then
    raise exception 'nothing sent';
  end if;

  update public.location_transfers
  set status = 'dikirim', fulfilled_at = now(), fulfilled_by_name = v_employee.name
  where id = p_transfer_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.fulfill_location_transfer_public(text, uuid, uuid, jsonb) to anon, authenticated;
