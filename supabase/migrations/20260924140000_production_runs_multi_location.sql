-- Produksi tadinya SENGAJA cuma didukung 1 lokasi produksi per bisnis
-- (getProductionLocationId pakai .maybeSingle() ke stock_locations WHERE
-- is_production=true) -- lihat catatan lama di produksi/actions.ts. Begitu
-- Llauk Nusantara butuh 2 lokasi produksi sekaligus (Kitchen + Bar),
-- resolver itu langsung gagal ("lokasi belum ditentukan") karena dapat 2
-- baris. production_runs perlu tahu sendiri di lokasi mana dia dicatat,
-- bukan nebak dari satu-satunya baris is_production=true.
alter table public.production_runs add column if not exists location_id uuid references public.stock_locations(id);

-- Backfill baris lama: sejauh ini semua bisnis yang pakai fitur ini historis
-- cuma punya 1 lokasi produksi, jadi aman diisi dari situ.
update public.production_runs pr
set location_id = sl.id
from public.stock_locations sl
where pr.location_id is null
  and sl.business_id = pr.business_id
  and sl.is_production = true;

-- RPC scan publik (portal-lokasi/[slug]/produksi) juga perlu simpan lokasi
-- asal draft-nya -- locationId sudah dikirim dari client (portal per lokasi)
-- tapi sebelumnya tidak pernah diteruskan ke RPC ini.
create or replace function public.submit_production_scan(
  p_slug text,
  p_item_id uuid,
  p_qty numeric,
  p_employee_id uuid,
  p_note text,
  p_new_item_name text default null,
  p_new_item_unit text default null,
  p_reported_ingredients jsonb default '[]'::jsonb,
  p_location_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_item record;
  v_employee_name text;
  v_run_id uuid;
  v_item_name text;
  v_unit text;
  v_line jsonb;
  v_line_ingredient_id uuid;
  v_line_qty numeric;
  v_line_name text;
  v_line_unit text;
begin
  select id
  into v_business
  from public.businesses
  where production_scan_slug = p_slug and (cost_control_enabled = true or rich_stock_ops_enabled = true);

  if not found then
    raise exception 'business not found';
  end if;

  if p_location_id is not null then
    if not exists (
      select 1 from public.stock_locations
      where id = p_location_id and business_id = v_business.id
    ) then
      raise exception 'location not found';
    end if;
  end if;

  if p_item_id is not null then
    select id, name, unit
    into v_item
    from public.semi_finished_items
    where id = p_item_id and business_id = v_business.id and deleted_at is null;

    if not found then
      raise exception 'item not found';
    end if;

    v_item_name := v_item.name;
    v_unit := v_item.unit;
  else
    if p_new_item_name is null or length(trim(p_new_item_name)) = 0 then
      raise exception 'item name required';
    end if;
    if p_new_item_unit is null or length(trim(p_new_item_unit)) = 0 then
      raise exception 'unit required';
    end if;
    v_item_name := trim(p_new_item_name);
    v_unit := trim(p_new_item_unit);
  end if;

  if p_qty is null or p_qty <= 0 or p_qty > 999999 then
    raise exception 'invalid quantity';
  end if;

  if jsonb_array_length(coalesce(p_reported_ingredients, '[]'::jsonb)) > 50 then
    raise exception 'too many reported ingredients';
  end if;

  v_employee_name := 'Tim Produksi';
  if p_employee_id is not null then
    select name into v_employee_name
    from public.employees
    where id = p_employee_id and business_id = v_business.id and active = true;

    if not found then
      raise exception 'employee not found';
    end if;
  end if;

  insert into public.production_runs
    (business_id, semi_finished_item_id, item_name, qty_produced, unit,
     produced_by_employee_id, produced_by_name, note, status, location_id)
  values
    (v_business.id, p_item_id, v_item_name, p_qty, v_unit,
     p_employee_id, v_employee_name, nullif(left(trim(coalesce(p_note, '')), 500), ''), 'pending', p_location_id)
  returning id into v_run_id;

  for v_line in select * from jsonb_array_elements(coalesce(p_reported_ingredients, '[]'::jsonb))
  loop
    v_line_qty := (v_line ->> 'qty')::numeric;
    if v_line_qty is null or v_line_qty <= 0 or v_line_qty > 999999 then
      continue;
    end if;

    v_line_ingredient_id := nullif(v_line ->> 'ingredientId', '')::uuid;
    if v_line_ingredient_id is not null then
      select name, unit into v_line_name, v_line_unit
      from public.ingredients
      where id = v_line_ingredient_id and business_id = v_business.id and deleted_at is null;

      if not found then
        v_line_ingredient_id := null;
        v_line_name := nullif(trim(v_line ->> 'newName'), '');
        v_line_unit := nullif(trim(v_line ->> 'newUnit'), '');
      end if;
    else
      v_line_name := nullif(trim(v_line ->> 'newName'), '');
      v_line_unit := nullif(trim(v_line ->> 'newUnit'), '');
    end if;

    if v_line_name is null or v_line_unit is null then
      continue;
    end if;

    insert into public.production_run_reported_consumptions
      (business_id, production_run_id, ingredient_id, reported_name, reported_unit, qty)
    values
      (v_business.id, v_run_id, v_line_ingredient_id, v_line_name, v_line_unit, v_line_qty);
  end loop;

  return v_run_id;
end;
$$;
