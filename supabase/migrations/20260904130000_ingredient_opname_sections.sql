-- "Bagian" bahan baku -- kategori bebas per bisnis (mis. "Adonan",
-- "Topping", "Kemasan") supaya Stok Opname bisa dipecah dan dikerjakan
-- beberapa orang sekaligus, bukan 1 orang hitung semua bahan (keluhan user:
-- Kitchen bahan bakunya kebanyakan). Sengaja tabel BARU & terpisah dari
-- `ingredients.departments` (Dapur/Bar/Front) -- itu buat routing Permintaan
-- Barang ke divisi POS, beda tujuan & cuma 3 nilai tetap, tidak cukup buat
-- pecah 1 divisi (mis. Dapur) jadi beberapa sub-bagian hitung stok.

create table public.ingredient_opname_sections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (business_id, name)
);

alter table public.ingredient_opname_sections enable row level security;

create policy "Owner manages opname sections of own businesses"
on public.ingredient_opname_sections for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

alter table public.ingredients
  add column opname_section_id uuid references public.ingredient_opname_sections (id) on delete set null;

-- get_stock_opname_info -- sertakan daftar bagian + section_id per bahan,
-- supaya form publik bisa nawarin pilih bagian sebelum nampilin daftar
-- bahan (staf cukup isi bagiannya sendiri, bukan semua bahan sekaligus).
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
    jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'unit', i.unit, 'section_id', i.opname_section_id) order by i.name asc),
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
