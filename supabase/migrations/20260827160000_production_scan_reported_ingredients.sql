-- User mau resep AKTUAL per batch bisa beda dari resep standar (BOM) yang
-- sudah diatur di Bahan Setengah Jadi -- staf yang scan produksi juga
-- melaporkan bahan baku apa & berapa banyak yang BENERAN dipakai untuk batch
-- itu (mis. "Bebek Ungkep 12 porsi, pakai Bebek 12kg + Bawang 10kg"), lalu
-- supervisor membandingkan laporan itu dengan resep standar dan memilih
-- angka mana yang benar-benar dipakai mengurangi stok saat verifikasi.
--
-- Baris laporan ini TERPISAH dari production_run_consumptions (yang isinya
-- SELALU snapshot final resmi apa pun jalur yang dipilih admin) -- supaya
-- laporan mentah dari HP tetap ada sebagai bukti/pembanding, tidak tertimpa.
create table public.production_run_reported_consumptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  production_run_id uuid not null references public.production_runs (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  reported_name text not null,
  reported_unit text not null,
  qty numeric(12, 4) not null check (qty > 0),
  created_at timestamptz not null default now()
);

create index production_run_reported_consumptions_run_id_idx
  on public.production_run_reported_consumptions (production_run_id);

alter table public.production_run_reported_consumptions enable row level security;

create policy "Owner manages reported consumptions of own businesses"
on public.production_run_reported_consumptions for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- RPC baca ikut kirim katalog Bahan Baku (buat pilih bahan yang dipakai).
create or replace function public.get_production_scan_info(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_employees jsonb;
  v_items jsonb;
  v_ingredients jsonb;
begin
  select id, name
  into v_business
  from public.businesses
  where production_scan_slug = p_slug and cost_control_enabled = true;

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
        'id', s.id, 'name', s.name, 'unit', s.unit, 'stock', s.stock, 'barcode', s.barcode,
        'recipe', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'name', case when r.component_type = 'ingredient' then ing.name else comp.name end,
                'qtyPerUnit', r.qty,
                'unit', r.unit,
                'availableStock', case when r.component_type = 'ingredient' then ing.stock else comp.stock end
              )
              order by case when r.component_type = 'ingredient' then ing.name else comp.name end
            ),
            '[]'::jsonb
          )
          from public.semi_finished_recipes r
          left join public.ingredients ing on ing.id = r.ingredient_id
          left join public.semi_finished_items comp on comp.id = r.component_semi_finished_id
          where r.semi_finished_item_id = s.id
        )
      )
      order by s.name asc
    ),
    '[]'::jsonb
  )
  into v_items
  from public.semi_finished_items s
  where s.business_id = v_business.id and s.deleted_at is null;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'unit', i.unit) order by i.name asc),
    '[]'::jsonb
  )
  into v_ingredients
  from public.ingredients i
  where i.business_id = v_business.id and i.deleted_at is null;

  return jsonb_build_object(
    'business_id', v_business.id,
    'business_name', v_business.name,
    'employees', v_employees,
    'items', v_items,
    'ingredients', v_ingredients
  );
end;
$$;

-- RPC tulis: sekarang ikut terima daftar bahan baku yang DILAPORKAN dipakai
-- untuk batch ini (opsional -- kalau kosong berarti staf tidak melaporkan
-- apa-apa, supervisor cuma bisa pakai resep standar saat verifikasi).
-- p_reported_ingredients: array of
--   {ingredientId: uuid|null, newName: text|null, newUnit: text|null, qty: numeric}
create or replace function public.submit_production_scan(
  p_slug text,
  p_item_id uuid,
  p_qty numeric,
  p_employee_id uuid,
  p_note text,
  p_new_item_name text default null,
  p_new_item_unit text default null,
  p_reported_ingredients jsonb default '[]'::jsonb
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
  where production_scan_slug = p_slug and cost_control_enabled = true;

  if not found then
    raise exception 'business not found';
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
     produced_by_employee_id, produced_by_name, note, status)
  values
    (v_business.id, p_item_id, v_item_name, p_qty, v_unit,
     p_employee_id, v_employee_name, nullif(left(trim(coalesce(p_note, '')), 500), ''), 'pending')
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

grant execute on function public.submit_production_scan(text, uuid, numeric, uuid, text, text, text, jsonb) to anon, authenticated;

drop function if exists public.submit_production_scan(text, uuid, numeric, uuid, text, text, text);
