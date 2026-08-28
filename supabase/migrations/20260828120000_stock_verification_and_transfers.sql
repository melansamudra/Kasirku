-- ============================================================
-- 1. Stok Opname jadi 2 tahap: submit (pending) -> admin verifikasi
-- ============================================================
-- Sebelumnya submit_stock_opname LANGSUNG apply ke stok sistem. Sekarang
-- cuma nyimpen LAPORAN staf dulu -- admin yang putuskan apply/tolak lewat
-- halaman Kartu Stok/Stok Opname, supaya ada kesempatan cek dulu sebelum
-- stok sistem berubah (mis. staf salah ketik).
create table public.stock_opname_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  location_id uuid not null references public.stock_locations (id) on delete cascade,
  component_type text not null check (component_type in ('ingredient', 'semi_finished')),
  ingredient_id uuid references public.ingredients (id) on delete cascade,
  semi_finished_item_id uuid references public.semi_finished_items (id) on delete cascade,
  item_name text not null,
  unit text not null,
  reported_stock numeric(12, 2) not null,
  system_stock_at_report numeric(12, 2) not null,
  submitted_by_name text not null,
  entry_date date not null default (now()::date),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint stock_opname_entries_component_chk check (
    (component_type = 'ingredient' and ingredient_id is not null and semi_finished_item_id is null)
    or
    (component_type = 'semi_finished' and semi_finished_item_id is not null and ingredient_id is null)
  )
);

create index stock_opname_entries_location_status_idx
  on public.stock_opname_entries (business_id, location_id, status);

alter table public.stock_opname_entries enable row level security;

create policy "Owner manages stock opname entries of own businesses"
on public.stock_opname_entries for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- submit_stock_opname sekarang INSERT ke stock_opname_entries (status
-- 'pending'), bukan langsung update ingredient_location_stock/
-- semi_finished_item_location_stock lagi. system_stock_at_report cuma
-- snapshot informasi -- angka yang benar-benar dipakai buat apply nanti
-- tetap stok TERKINI di titik admin verifikasi (bisa beda kalau ada
-- pergerakan lain di antara submit & verifikasi).
create or replace function public.submit_stock_opname(
  p_slug text,
  p_employee_id uuid,
  p_location_id uuid,
  p_ingredient_counts jsonb,
  p_semi_finished_counts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_employee record;
  v_location record;
  v_row jsonb;
  v_stock numeric(12, 2);
  v_system_stock numeric(12, 2);
  v_ingredient record;
  v_semi record;
  v_entries_count int := 0;
begin
  select id into v_business_id from public.businesses where stock_opname_slug = p_slug;
  if v_business_id is null then
    raise exception 'business not found';
  end if;

  select id, name into v_employee
  from public.employees
  where id = p_employee_id and business_id = v_business_id and active = true;
  if not found then
    raise exception 'employee not found';
  end if;

  select id, name into v_location
  from public.stock_locations
  where id = p_location_id and business_id = v_business_id;
  if not found then
    raise exception 'location not found';
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_ingredient_counts, '[]'::jsonb))
  loop
    v_stock := (v_row ->> 'stock')::numeric;
    if v_stock is null or v_stock < 0 then
      continue;
    end if;

    select id, name, unit into v_ingredient
    from public.ingredients
    where id = (v_row ->> 'id')::uuid and business_id = v_business_id and deleted_at is null;
    if not found then
      continue;
    end if;

    select stock into v_system_stock
    from public.ingredient_location_stock
    where business_id = v_business_id and location_id = p_location_id and ingredient_id = v_ingredient.id;
    v_system_stock := coalesce(v_system_stock, 0);

    insert into public.stock_opname_entries
      (business_id, location_id, component_type, ingredient_id, item_name, unit, reported_stock, system_stock_at_report, submitted_by_name)
    values
      (v_business_id, p_location_id, 'ingredient', v_ingredient.id, v_ingredient.name, v_ingredient.unit, v_stock, v_system_stock, v_employee.name);

    v_entries_count := v_entries_count + 1;
  end loop;

  for v_row in select * from jsonb_array_elements(coalesce(p_semi_finished_counts, '[]'::jsonb))
  loop
    v_stock := (v_row ->> 'stock')::numeric;
    if v_stock is null or v_stock < 0 then
      continue;
    end if;

    select id, name, unit into v_semi
    from public.semi_finished_items
    where id = (v_row ->> 'id')::uuid and business_id = v_business_id and deleted_at is null;
    if not found then
      continue;
    end if;

    select stock into v_system_stock
    from public.semi_finished_item_location_stock
    where business_id = v_business_id and location_id = p_location_id and semi_finished_item_id = v_semi.id;
    v_system_stock := coalesce(v_system_stock, 0);

    insert into public.stock_opname_entries
      (business_id, location_id, component_type, semi_finished_item_id, item_name, unit, reported_stock, system_stock_at_report, submitted_by_name)
    values
      (v_business_id, p_location_id, 'semi_finished', v_semi.id, v_semi.name, v_semi.unit, v_stock, v_system_stock, v_employee.name);

    v_entries_count := v_entries_count + 1;
  end loop;

  return jsonb_build_object('entries_count', v_entries_count);
end;
$$;

-- ============================================================
-- 2. Transfer internal antar lokasi (Kitchen Atas/Bar Llauk -> Dapur
--    Produksi) -- Kitchen/Bar minta Bahan Setengah Jadi, Dapur Produksi
--    kirim, stok otomatis pindah (keluar dari Dapur Produksi, masuk ke
--    lokasi peminta). Beda dari Permintaan Barang (itu ke supplier luar).
-- ============================================================
create table public.location_transfers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  from_location_id uuid not null references public.stock_locations (id) on delete cascade, -- yang MENGIRIM (Dapur Produksi)
  to_location_id uuid not null references public.stock_locations (id) on delete cascade, -- yang MEMINTA (Kitchen Atas/Bar Llauk)
  requested_by_name text not null,
  note text,
  status text not null default 'baru' check (status in ('baru', 'dikirim')),
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

create table public.location_transfer_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  transfer_id uuid not null references public.location_transfers (id) on delete cascade,
  semi_finished_item_id uuid not null references public.semi_finished_items (id) on delete cascade,
  item_name text not null,
  unit text not null,
  qty_requested numeric(12, 2) not null,
  qty_sent numeric(12, 2)
);

create index location_transfers_to_location_status_idx
  on public.location_transfers (business_id, to_location_id, status);
create index location_transfer_items_transfer_id_idx
  on public.location_transfer_items (transfer_id);

alter table public.location_transfers enable row level security;
alter table public.location_transfer_items enable row level security;

create policy "Owner manages location transfers of own businesses"
on public.location_transfers for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

create policy "Owner manages location transfer items of own businesses"
on public.location_transfer_items for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Link publik (tanpa login) -- pola sama persis dengan Permintaan Barang/
-- Stok Opname. Slug per-business, lokasi peminta ditentukan dari
-- ?lokasi=<id lokasi> di URL (bukan lokasi terkunci fixed keyword kayak
-- "produksi" -- di sini lokasinya macam-macam, Kitchen Atas ATAU Bar
-- Llauk, jadi butuh id eksplisit).
alter table public.businesses add column location_transfer_slug text unique;

update public.businesses
set location_transfer_slug = encode(extensions.gen_random_bytes(9), 'hex')
where location_transfer_slug is null;

create or replace function public.get_location_transfer_info(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_employees jsonb;
  v_locations jsonb;
  v_semi_finished jsonb;
begin
  select id, name into v_business
  from public.businesses
  where location_transfer_slug = p_slug;

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

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', l.id, 'name', l.name, 'is_production', l.is_production)
      order by l.sort_order asc
    ),
    '[]'::jsonb
  )
  into v_locations
  from public.stock_locations l
  where l.business_id = v_business.id;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'unit', s.unit) order by s.name asc),
    '[]'::jsonb
  )
  into v_semi_finished
  from public.semi_finished_items s
  where s.business_id = v_business.id and s.deleted_at is null;

  return jsonb_build_object(
    'business_id', v_business.id,
    'business_name', v_business.name,
    'employees', v_employees,
    'stock_locations', v_locations,
    'semi_finished_items', v_semi_finished
  );
end;
$$;

create or replace function public.submit_location_transfer_request(
  p_slug text,
  p_requesting_location_id uuid, -- lokasi PEMINTA (Kitchen Atas/Bar Llauk) -- akan jadi to_location_id
  p_employee_id uuid,
  p_note text,
  p_items jsonb -- array of {id, qty}
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_employee record;
  v_requesting_location record;
  v_fulfilling_location_id uuid; -- Dapur Produksi (is_production) -- akan jadi from_location_id
  v_transfer_id uuid;
  v_row jsonb;
  v_qty numeric(12, 2);
  v_semi record;
  v_item_count int := 0;
begin
  select id into v_business_id from public.businesses where location_transfer_slug = p_slug;
  if v_business_id is null then
    raise exception 'business not found';
  end if;

  select id, name into v_employee
  from public.employees
  where id = p_employee_id and business_id = v_business_id and active = true;
  if not found then
    raise exception 'employee not found';
  end if;

  select id, name into v_requesting_location
  from public.stock_locations
  where id = p_requesting_location_id and business_id = v_business_id;
  if not found then
    raise exception 'location not found';
  end if;

  select id into v_fulfilling_location_id
  from public.stock_locations
  where business_id = v_business_id and is_production = true;
  if v_fulfilling_location_id is null then
    raise exception 'production location not found';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'request is empty';
  end if;

  insert into public.location_transfers (business_id, from_location_id, to_location_id, requested_by_name, note)
  values (v_business_id, v_fulfilling_location_id, p_requesting_location_id, v_employee.name, nullif(left(trim(coalesce(p_note, '')), 500), ''))
  returning id into v_transfer_id;

  for v_row in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_row ->> 'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      continue;
    end if;

    select id, name, unit into v_semi
    from public.semi_finished_items
    where id = (v_row ->> 'id')::uuid and business_id = v_business_id and deleted_at is null;
    if not found then
      continue;
    end if;

    insert into public.location_transfer_items (business_id, transfer_id, semi_finished_item_id, item_name, unit, qty_requested)
    values (v_business_id, v_transfer_id, v_semi.id, v_semi.name, v_semi.unit, v_qty);

    v_item_count := v_item_count + 1;
  end loop;

  if v_item_count = 0 then
    raise exception 'no valid items';
  end if;

  return v_transfer_id;
end;
$$;
