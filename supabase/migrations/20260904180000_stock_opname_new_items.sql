-- Staf yang isi Stok Opname lewat link publik sekarang bisa tambah bahan
-- baku/BSJ baru langsung dari form kalau belum ada di katalog (mis. baru
-- beli bahan, belum sempat didaftarkan admin) -- harga/HPP-nya diskip dulu
-- (unit_cost/manual_unit_cost tetap 0/kosong, admin lengkapi belakangan di
-- halaman Bahan Baku/Bahan Setengah Jadi). Bahan baru otomatis ditandai ke
-- Bagian yang lagi dipilih di form (kalau ada) supaya tidak perlu ditandai
-- ulang manual. Cek dulu nama yang sama (case-insensitive) sebelum bikin
-- baru, biar tidak dobel kalau staf lain sudah nambahin bahan yang sama.
create or replace function public.submit_stock_opname(
  p_slug text,
  p_employee_id uuid,
  p_location_id uuid,
  p_ingredient_counts jsonb,
  p_semi_finished_counts jsonb,
  p_entry_date date default null,
  p_new_ingredients jsonb default null,
  p_new_semi_finished jsonb default null,
  p_section_id uuid default null
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
  v_entry_date date := coalesce(p_entry_date, now()::date);
  v_new_name text;
  v_new_unit text;
  v_new_id uuid;
begin
  if v_entry_date > now()::date then
    raise exception 'entry date cannot be in the future';
  end if;

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

  -- Bahan baku baru (belum ada di katalog).
  for v_row in select * from jsonb_array_elements(coalesce(p_new_ingredients, '[]'::jsonb))
  loop
    v_new_name := trim(v_row ->> 'name');
    v_new_unit := trim(v_row ->> 'unit');
    v_stock := (v_row ->> 'stock')::numeric;
    if v_new_name = '' or v_new_unit = '' or v_stock is null or v_stock < 0 then
      continue;
    end if;

    select id into v_new_id
    from public.ingredients
    where business_id = v_business_id and deleted_at is null and lower(name) = lower(v_new_name)
    limit 1;

    if v_new_id is null then
      insert into public.ingredients (business_id, name, unit, unit_cost, stock, min_stock)
      values (v_business_id, v_new_name, v_new_unit, 0, 0, 0)
      returning id into v_new_id;

      if p_section_id is not null then
        insert into public.ingredient_opname_section_items (business_id, ingredient_id, section_id)
        values (v_business_id, v_new_id, p_section_id)
        on conflict do nothing;
      end if;
    end if;

    insert into public.stock_opname_entries
      (business_id, location_id, component_type, ingredient_id, item_name, unit, reported_stock, system_stock_at_report, submitted_by_name, entry_date)
    values
      (v_business_id, p_location_id, 'ingredient', v_new_id, v_new_name, v_new_unit, v_stock, 0, v_employee.name, v_entry_date);

    v_entries_count := v_entries_count + 1;
  end loop;

  -- Bahan setengah jadi baru (belum ada di katalog).
  for v_row in select * from jsonb_array_elements(coalesce(p_new_semi_finished, '[]'::jsonb))
  loop
    v_new_name := trim(v_row ->> 'name');
    v_new_unit := trim(v_row ->> 'unit');
    v_stock := (v_row ->> 'stock')::numeric;
    if v_new_name = '' or v_new_unit = '' or v_stock is null or v_stock < 0 then
      continue;
    end if;

    select id into v_new_id
    from public.semi_finished_items
    where business_id = v_business_id and deleted_at is null and lower(name) = lower(v_new_name)
    limit 1;

    if v_new_id is null then
      insert into public.semi_finished_items (business_id, name, unit)
      values (v_business_id, v_new_name, v_new_unit)
      returning id into v_new_id;

      if p_section_id is not null then
        insert into public.semi_finished_item_opname_section_items (business_id, semi_finished_item_id, section_id)
        values (v_business_id, v_new_id, p_section_id)
        on conflict do nothing;
      end if;
    end if;

    insert into public.stock_opname_entries
      (business_id, location_id, component_type, semi_finished_item_id, item_name, unit, reported_stock, system_stock_at_report, submitted_by_name, entry_date)
    values
      (v_business_id, p_location_id, 'semi_finished', v_new_id, v_new_name, v_new_unit, v_stock, 0, v_employee.name, v_entry_date);

    v_entries_count := v_entries_count + 1;
  end loop;

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
      (business_id, location_id, component_type, ingredient_id, item_name, unit, reported_stock, system_stock_at_report, submitted_by_name, entry_date)
    values
      (v_business_id, p_location_id, 'ingredient', v_ingredient.id, v_ingredient.name, v_ingredient.unit, v_stock, v_system_stock, v_employee.name, v_entry_date);

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
      (business_id, location_id, component_type, semi_finished_item_id, item_name, unit, reported_stock, system_stock_at_report, submitted_by_name, entry_date)
    values
      (v_business_id, p_location_id, 'semi_finished', v_semi.id, v_semi.name, v_semi.unit, v_stock, v_system_stock, v_employee.name, v_entry_date);

    v_entries_count := v_entries_count + 1;
  end loop;

  return jsonb_build_object('entries_count', v_entries_count);
end;
$$;
