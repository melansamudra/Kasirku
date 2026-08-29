-- Portal Lokasi -- staf pilih nama + PIN sekali (mirip pola login PIN
-- kasir: pgcrypto hash di database, cookie ringan "siapa yang pegang
-- device", BUKAN reuse infrastruktur cashiers/business_staff sama sekali --
-- staf lokasi bukan kasir/manajer/pelayan, dan cashiers terikat erat ke
-- transaksi jualan POS). Setelah login sekali, staf lihat menu tugas yang
-- relevan buat lokasinya (Kirim/Transfer, Terima Barang, Stok Opname) tanpa
-- perlu pilih nama ulang tiap kali submit -- identitas dari sesi.
--
-- Desain generic per-lokasi dari awal (slug 1x per bisnis + ?lokasi=<uuid>,
-- pola sama stock_opname_slug/receive_stock_slug) walau yang dibangun &
-- dites ronde ini cuma Dapur Produksi.

alter table public.employees add column pin_hash text;
revoke select (pin_hash) on public.employees from authenticated, anon;

-- Owner perlu tahu "PIN sudah diset atau belum" per staf di halaman Staf
-- lokasi, tapi TIDAK boleh pernah bisa select pin_hash mentah -- kolom
-- generated ini aman dipilih (cuma boolean, bukan hash-nya).
alter table public.employees add column has_pin boolean generated always as (pin_hash is not null) stored;

alter table public.businesses add column location_portal_slug text unique;
update public.businesses
set location_portal_slug = encode(extensions.gen_random_bytes(9), 'hex')
where location_portal_slug is null;

-- Siapa yang kirim lewat Transfer Internal -- sebelumnya tidak dicatat sama
-- sekali (cuma fulfilled_at). Dipakai portal (dan boleh dipakai dashboard
-- juga kalau nanti mau, tidak wajib).
alter table public.location_transfers add column fulfilled_by_name text;

-- Owner set/reset PIN staf (context: halaman Staf lokasi, authenticated,
-- owns_business dicek eksplisit karena SECURITY DEFINER bypass RLS) --
-- pola sama create_cashier/reset_cashier_pin.
create or replace function public.set_employee_pin(
  p_business_id uuid,
  p_employee_id uuid,
  p_pin text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN harus 4 digit angka';
  end if;

  update public.employees
  set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf'))
  where id = p_employee_id and business_id = p_business_id;

  if not found then
    raise exception 'employee not found';
  end if;
end;
$$;

grant execute on function public.set_employee_pin(uuid, uuid, text) to authenticated;

-- Login portal -- publik (anon), slug-keyed (BUKAN owns_business, beda
-- dari verify_cashier_pin yang jalan di device yang sudah login dashboard
-- owner). Bedakan "PIN belum diset" vs "PIN salah" biar pesannya jelas.
--
-- Nama kolom OUT sengaja employee_id/employee_name (bukan id/name) --
-- kalau dinamai "id" polos, bentrok ambigu dengan `businesses.id` yang
-- dipakai tanpa alias di bawah (PL/pgSQL error "column reference id is
-- ambiguous", ketauan pas verifikasi). `create or replace` tidak bisa
-- ganti nama kolom OUT dari versi yang sudah sempat dijalankan sebelumnya
-- (returns table(id, name)) -- drop dulu eksplisit.
drop function if exists public.verify_employee_pin(text, uuid, text);

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
  select id into v_business_id from public.businesses where location_portal_slug = p_slug;
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

-- Bundel info buat layar login (daftar nama staf lokasi ini) + home portal
-- (badge jumlah tugas) dalam 1 panggilan -- dipanggil tiap kali halaman
-- portal dibuka, terlepas dari sudah login atau belum.
create or replace function public.get_location_portal_home(p_slug text, p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_location record;
  v_employees jsonb;
  v_pending_transfer_count int;
  v_pending_receive_count int;
begin
  select id, name, stock_opname_slug, receive_stock_slug into v_business
  from public.businesses
  where location_portal_slug = p_slug;
  if not found then
    return null;
  end if;

  select id, name, is_production, is_default_purchase into v_location
  from public.stock_locations
  where id = p_location_id and business_id = v_business.id;
  if not found then
    return jsonb_build_object('business_id', v_business.id, 'business_name', v_business.name, 'location', null);
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name) order by e.name asc),
    '[]'::jsonb
  )
  into v_employees
  from public.employees e
  where e.business_id = v_business.id and e.location_id = p_location_id and e.active = true;

  select count(*) into v_pending_transfer_count
  from public.location_transfers t
  where t.business_id = v_business.id and t.from_location_id = p_location_id and t.status = 'baru';

  select count(*) into v_pending_receive_count
  from public.purchase_request_item_stock_fulfillments f
  join public.purchase_request_items pri on pri.id = f.purchase_request_item_id
  join public.purchase_requests pr on pr.id = pri.purchase_request_id
  where f.business_id = v_business.id and f.received_at is null and pr.location_id = p_location_id;

  return jsonb_build_object(
    'business_id', v_business.id,
    'business_name', v_business.name,
    'stock_opname_slug', v_business.stock_opname_slug,
    'receive_stock_slug', v_business.receive_stock_slug,
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

grant execute on function public.get_location_portal_home(text, uuid) to anon, authenticated;

-- Daftar permintaan Transfer Internal yang menunggu dikirim dari lokasi ini
-- (setara query di lokasi/[locationId]/transfer/page.tsx, sisi pengirim).
create or replace function public.get_location_portal_transfers(p_slug text, p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_transfers jsonb;
begin
  select id into v_business_id from public.businesses where location_portal_slug = p_slug;
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
  where t.business_id = v_business_id and t.from_location_id = p_location_id and t.status = 'baru';

  return jsonb_build_object('transfers', v_transfers);
end;
$$;

grant execute on function public.get_location_portal_transfers(text, uuid) to anon, authenticated;

-- Kirim barang buat 1 permintaan transfer -- reimplementasi
-- fulfillLocationTransfer (lokasi/[locationId]/transfer/actions.ts) di
-- plpgsql, sengaja terpisah dari action TS yang ada (dashboard tetap pakai
-- yang lama, tidak disentuh -- pola sama receive_stock_fulfillment_public).
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
  select id into v_business_id from public.businesses where location_portal_slug = p_slug;
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
