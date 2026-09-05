-- Versi lebih aman dari percobaan 20260905120000 (sudah di-revert) --
-- bukan mengunci daftar BAHAN (item bisa hilang kalau belum ditandai ke
-- Bagian, terbukti bermasalah karena baru 221/1036 bahan Llauk yang
-- ditandai), tapi cuma memangkas PILIHAN di dropdown "Bagian" itu sendiri
-- di form publik /stok-opname/[slug] -- supaya link Kitchen tidak lagi
-- nawarin pilihan "HM Bar" (punya Bar) dan sebaliknya. "Semua Bagian" tetap
-- ada & tetap menampilkan semua bahan seperti sebelumnya (aman buat bahan
-- yang belum ditandai) -- cuma opsi Bagian LAIN divisi yang disembunyikan.
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
        'is_production', l.is_production,
        'bound_section_ids', (
          select coalesce(jsonb_agg(x.section_id), '[]'::jsonb)
          from public.stock_location_opname_sections x
          where x.location_id = l.id
        )
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
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'unit', s.unit,
        'section_ids', (
          select coalesce(jsonb_agg(x.section_id), '[]'::jsonb)
          from public.semi_finished_item_opname_section_items x
          where x.semi_finished_item_id = s.id
        )
      )
      order by s.name asc
    ),
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
