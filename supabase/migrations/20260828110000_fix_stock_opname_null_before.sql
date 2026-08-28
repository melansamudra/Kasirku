-- Fix bug submit_stock_opname: SELECT INTO yang tidak nemu baris (bahan
-- belum pernah ada stok tersimpan di lokasi ini -- kasus wajar utk opname
-- PERTAMA KALI) mengisi v_before dengan NULL, bukan "tetap nilai
-- sebelumnya" seperti salah kira di migration awal (20260828100000) --
-- akibatnya v_diff & stock_before ikut NULL, bentrok NOT NULL constraint
-- di stock_adjustments.stock_before, submit gagal total (error 23502).
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
