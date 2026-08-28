-- Link publik (tanpa login) buat staf isi stok fisik harian per lokasi --
-- pola PERSIS sama dengan purchase_request_slug/get_purchase_request_info
-- (permintaan-barang), cuma beda tujuan: bukan minta barang, tapi lapor
-- stok akhir hari ini supaya sistem otomatis hitung selisih & catat ke
-- stock_adjustments (reason='Stok opname'), sama seperti form admin yang
-- sudah ada di lokasi/[locationId]/bahan-baku & semi-finished-items.
alter table public.businesses add column stock_opname_slug text unique;

update public.businesses
set stock_opname_slug = encode(extensions.gen_random_bytes(9), 'hex')
where stock_opname_slug is null;

-- Siapa yang lapor -- form admin manual tidak butuh ini (yang input =
-- yang login), tapi link publik ini bisa dipakai siapa saja yang pegang
-- link, jadi perlu dicatat namanya sendiri (dari dropdown karyawan, sama
-- seperti nama di Permintaan Barang publik).
alter table public.stock_adjustments add column submitted_by_name text;

create or replace function public.get_stock_opname_info(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_employees jsonb;
  v_locations jsonb;
  v_ingredients jsonb;
  v_semi_finished jsonb;
begin
  select id, name, cost_control_enabled
  into v_business
  from public.businesses
  where stock_opname_slug = p_slug;

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
      jsonb_build_object(
        'id', l.id,
        'name', l.name,
        'is_default_purchase', l.is_default_purchase,
        'is_production', l.is_production
      )
      order by l.sort_order asc
    ),
    '[]'::jsonb
  )
  into v_locations
  from public.stock_locations l
  where l.business_id = v_business.id;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'unit', i.unit) order by i.name asc),
    '[]'::jsonb
  )
  into v_ingredients
  from public.ingredients i
  where i.business_id = v_business.id and i.deleted_at is null;

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
    'cost_control_enabled', v_business.cost_control_enabled,
    'employees', v_employees,
    'stock_locations', v_locations,
    'ingredients', v_ingredients,
    'semi_finished_items', v_semi_finished
  );
end;
$$;

-- Snapshot stok sistem SAAT INI utk 1 lokasi -- dipanggil setelah lokasi
-- diketahui (dari ?lokasi= atau staf pilih sendiri), supaya form bisa
-- tampilkan "Sistem: X gr" di sebelah tiap input, jadi staf gampang
-- sadar kalau angkanya beda jauh.
create or replace function public.get_location_stock_snapshot(p_slug text, p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_location_id uuid;
  v_ingredient_stocks jsonb;
  v_semi_finished_stocks jsonb;
begin
  select id into v_business_id from public.businesses where stock_opname_slug = p_slug;
  if v_business_id is null then
    raise exception 'business not found';
  end if;

  select id into v_location_id
  from public.stock_locations
  where id = p_location_id and business_id = v_business_id;
  if v_location_id is null then
    raise exception 'location not found';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', ingredient_id, 'stock', stock)), '[]'::jsonb)
  into v_ingredient_stocks
  from public.ingredient_location_stock
  where business_id = v_business_id and location_id = v_location_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', semi_finished_item_id, 'stock', stock)), '[]'::jsonb)
  into v_semi_finished_stocks
  from public.semi_finished_item_location_stock
  where business_id = v_business_id and location_id = v_location_id;

  return jsonb_build_object(
    'ingredient_stocks', v_ingredient_stocks,
    'semi_finished_stocks', v_semi_finished_stocks
  );
end;
$$;

-- Submit hasil opname -- dipanggil sekali per submit, isi banyak bahan
-- sekaligus (bukan satu-satu kayak form admin manual). Baris yang diff-nya
-- 0 dilewati diam-diam (bukan error, beda dari form admin manual) karena
-- di sini wajar banyak bahan stoknya memang tidak berubah.
create or replace function public.submit_stock_opname(
  p_slug text,
  p_employee_id uuid,
  p_location_id uuid,
  p_ingredient_counts jsonb, -- array of {id, stock}
  p_semi_finished_counts jsonb -- array of {id, stock}
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
  v_before numeric(12, 2);
  v_diff numeric(12, 2);
  v_ingredient record;
  v_semi record;
  v_adjusted_count int := 0;
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

    -- SELECT INTO yang tidak nemu baris (bahan ini belum pernah ada stok di
    -- lokasi ini) mengisi v_before dengan NULL (bukan "tetap kosong" seperti
    -- salah kira sebelumnya) -- coalesce WAJIB di baris berikutnya, kalau
    -- tidak v_diff/stock_before ikut NULL dan bentrok NOT NULL constraint.
    select stock into v_before
    from public.ingredient_location_stock
    where business_id = v_business_id and location_id = p_location_id and ingredient_id = v_ingredient.id;
    v_before := coalesce(v_before, 0);
    v_diff := v_stock - v_before;
    if v_diff = 0 then
      continue;
    end if;

    insert into public.ingredient_location_stock (business_id, location_id, ingredient_id, stock, updated_at)
    values (v_business_id, p_location_id, v_ingredient.id, v_stock, now())
    on conflict (location_id, ingredient_id) do update set stock = excluded.stock, updated_at = excluded.updated_at;

    insert into public.stock_adjustments
      (business_id, ingredient_id, location_id, item_name, unit, stock_before, stock_after, diff, reason, submitted_by_name)
    values
      (v_business_id, v_ingredient.id, p_location_id, v_ingredient.name, v_ingredient.unit, v_before, v_stock, v_diff, 'Stok opname', v_employee.name);

    v_adjusted_count := v_adjusted_count + 1;
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

    select stock into v_before
    from public.semi_finished_item_location_stock
    where business_id = v_business_id and location_id = p_location_id and semi_finished_item_id = v_semi.id;
    v_before := coalesce(v_before, 0);
    v_diff := v_stock - v_before;
    if v_diff = 0 then
      continue;
    end if;

    insert into public.semi_finished_item_location_stock (business_id, location_id, semi_finished_item_id, stock, updated_at)
    values (v_business_id, p_location_id, v_semi.id, v_stock, now())
    on conflict (location_id, semi_finished_item_id) do update set stock = excluded.stock, updated_at = excluded.updated_at;

    insert into public.stock_adjustments
      (business_id, semi_finished_item_id, location_id, item_name, unit, stock_before, stock_after, diff, reason, submitted_by_name)
    values
      (v_business_id, v_semi.id, p_location_id, v_semi.name, v_semi.unit, v_before, v_stock, v_diff, 'Stok opname', v_employee.name);

    v_adjusted_count := v_adjusted_count + 1;
  end loop;

  return jsonb_build_object('adjusted_count', v_adjusted_count);
end;
$$;
