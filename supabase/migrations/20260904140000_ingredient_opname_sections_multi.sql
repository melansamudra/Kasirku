-- Bahan baku yang dipakai di lebih dari 1 bagian Stok Opname (mis. Air, Es
-- Batu dipakai di 2-3 bagian sekaligus) sebelumnya cuma bisa ditandai 1
-- bagian (kolom `opname_section_id` tunggal, lihat 20260904130000) -- sama
-- persis masalah yang pernah terjadi di `ingredients.departments` (fix
-- 20260903090000). Diganti jadi tabel junction many-to-many, bisa ditandai
-- lebih dari satu bagian sekaligus.

create table public.ingredient_opname_section_items (
  business_id uuid not null references public.businesses (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  section_id uuid not null references public.ingredient_opname_sections (id) on delete cascade,
  primary key (ingredient_id, section_id)
);

create index ingredient_opname_section_items_section_idx
  on public.ingredient_opname_section_items (section_id);

alter table public.ingredient_opname_section_items enable row level security;

create policy "Owner manages opname section items of own businesses"
on public.ingredient_opname_section_items for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Backfill dari kolom lama sebelum di-drop.
insert into public.ingredient_opname_section_items (business_id, ingredient_id, section_id)
select business_id, id, opname_section_id
from public.ingredients
where opname_section_id is not null;

alter table public.ingredients drop column opname_section_id;

-- get_stock_opname_info -- 'section_id' tunggal jadi 'section_ids' array.
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
  v_sections jsonb;
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
    jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name asc),
    '[]'::jsonb
  )
  into v_sections
  from public.ingredient_opname_sections s
  where s.business_id = v_business.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'name', i.name,
        'unit', i.unit,
        'section_ids', (
          select coalesce(jsonb_agg(x.section_id), '[]'::jsonb)
          from public.ingredient_opname_section_items x
          where x.ingredient_id = i.id
        )
      )
      order by i.name asc
    ),
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
    'sections', v_sections,
    'ingredients', v_ingredients,
    'semi_finished_items', v_semi_finished
  );
end;
$$;
