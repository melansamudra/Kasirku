-- Staf yang ngisi Stok Opname lewat link publik bisa pilih tanggal opname
-- (default hari ini, boleh diganti ke tanggal lampau kalau baru sempat
-- dicatat telat) -- pola sama seperti "Tanggal Kasbon" di Kas Kecil.
-- Sebelumnya entry_date SELALU now()::date (default kolom, tidak pernah
-- di-override dari insert), jadi staf tidak bisa pilih tanggal.
create or replace function public.submit_stock_opname(
  p_slug text,
  p_employee_id uuid,
  p_location_id uuid,
  p_ingredient_counts jsonb,
  p_semi_finished_counts jsonb,
  p_entry_date date default null
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
