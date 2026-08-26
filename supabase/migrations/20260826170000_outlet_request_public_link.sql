-- Modul Cost Control (Produksi & Distribusi) di-gate per-bisnis lewat
-- cost_control_enabled — supaya menu & link publik ini hanya muncul untuk
-- bisnis yang memang dinyalakan (mis. "Lauk Nusantara"), bukan semua bisnis
-- FNB Kasirku. Sama pola dengan mirroring_enabled: kolom di businesses,
-- di-toggle super-admin lewat src/app/admin/, dibaca layout.tsx.
alter table public.businesses add column cost_control_enabled boolean not null default false;

-- Token akses link publik "Permintaan Resto" — satu per bisnis, sama pola
-- dengan purchase_request_slug/attendance_qr_slug. Beda kecil: dikasih
-- DEFAULT di kolomnya (bukan cuma backfill sekali) supaya bisnis BARU juga
-- otomatis dapat slug tanpa perlu klik "Ganti Link" dulu.
alter table public.businesses
  add column outlet_request_slug text unique default encode(extensions.gen_random_bytes(9), 'hex');

update public.businesses
set outlet_request_slug = encode(extensions.gen_random_bytes(9), 'hex')
where outlet_request_slug is null;

-- RPC baca: nama toko + outlet aktif + karyawan aktif + katalog bahan
-- setengah jadi (dengan stok saat ini) buat form publik outlet. Beda dari
-- get_purchase_request_info: hanya jalan kalau cost_control_enabled = true,
-- jadi slug yang bocor pun tidak berfungsi kalau modul belum dinyalakan.
create or replace function public.get_outlet_request_info(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_outlets jsonb;
  v_employees jsonb;
  v_items jsonb;
begin
  select id, name
  into v_business
  from public.businesses
  where outlet_request_slug = p_slug and cost_control_enabled = true;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) order by o.name asc),
    '[]'::jsonb
  )
  into v_outlets
  from public.outlets o
  where o.business_id = v_business.id and o.active = true;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name) order by e.created_at asc),
    '[]'::jsonb
  )
  into v_employees
  from public.employees e
  where e.business_id = v_business.id and e.active = true;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', s.id, 'name', s.name, 'unit', s.unit, 'stock', s.stock)
      order by s.name asc
    ),
    '[]'::jsonb
  )
  into v_items
  from public.semi_finished_items s
  where s.business_id = v_business.id and s.deleted_at is null;

  return jsonb_build_object(
    'business_id', v_business.id,
    'business_name', v_business.name,
    'outlets', v_outlets,
    'employees', v_employees,
    'items', v_items
  );
end;
$$;

grant execute on function public.get_outlet_request_info(text) to anon, authenticated;

-- RPC tulis: submit permintaan outlet. Beda dari submit_purchase_request:
-- item TIDAK bisa dibuat baru dari form publik — katalog bahan setengah jadi
-- harus sudah didefinisikan lewat dashboard admin (HPP-nya harus dikontrol),
-- form publik cuma boleh pilih dari katalog yang sudah ada.
create or replace function public.submit_outlet_request(
  p_slug text,
  p_outlet_id uuid,
  p_employee_id uuid,
  p_note text,
  p_items jsonb -- array of {itemId, qtyRequested}
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_outlet record;
  v_employee record;
  v_request_id uuid;
  v_item jsonb;
  v_qty numeric(12, 2);
  v_item_id uuid;
  v_item_name text;
  v_unit text;
begin
  select id
  into v_business
  from public.businesses
  where outlet_request_slug = p_slug and cost_control_enabled = true;

  if not found then
    raise exception 'business not found';
  end if;

  select id, name
  into v_outlet
  from public.outlets
  where id = p_outlet_id and business_id = v_business.id and active = true;

  if not found then
    raise exception 'outlet not found';
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

  insert into public.outlet_requests
    (business_id, outlet_id, outlet_name, employee_id, employee_name, note, status)
  values
    (v_business.id, v_outlet.id, v_outlet.name, v_employee.id, v_employee.name,
     nullif(left(trim(coalesce(p_note, '')), 500), ''), 'baru')
  returning id into v_request_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'qtyRequested')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 999999 then
      raise exception 'invalid quantity';
    end if;

    select id, name, unit into v_item_id, v_item_name, v_unit
    from public.semi_finished_items
    where id = (v_item ->> 'itemId')::uuid and business_id = v_business.id and deleted_at is null;

    if not found then
      raise exception 'item not found';
    end if;

    insert into public.outlet_request_items
      (business_id, outlet_request_id, semi_finished_item_id, item_name, unit, qty_requested)
    values
      (v_business.id, v_request_id, v_item_id, v_item_name, v_unit, v_qty);
  end loop;

  return v_request_id;
end;
$$;

grant execute on function public.submit_outlet_request(text, uuid, uuid, text, jsonb) to anon, authenticated;
