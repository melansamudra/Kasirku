-- Lebarkan gate daftar lokasi di link PR publik supaya bisnis dengan
-- stock_locations_enabled (mis. Adi's Culinary) juga dapat dropdown
-- lokasi, bukan cuma bisnis cost_control_enabled. Isi fungsi sama
-- persis dengan versi 20260828080000_pr_locked_location_link.sql,
-- cuma kondisi v_locations yang berubah.
create or replace function public.get_purchase_request_info(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_employees jsonb;
  v_items jsonb;
  v_locations jsonb;
begin
  select id, name, business_type, cost_control_enabled, stock_locations_enabled
  into v_business
  from public.businesses
  where purchase_request_slug = p_slug;

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

  if v_business.cost_control_enabled or v_business.stock_locations_enabled then
    select coalesce(
      jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'is_production', l.is_production) order by l.sort_order asc),
      '[]'::jsonb
    )
    into v_locations
    from public.stock_locations l
    where l.business_id = v_business.id;
  else
    v_locations := '[]'::jsonb;
  end if;

  if v_business.business_type = 'fnb' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'name', i.name,
          'unit', i.unit,
          'stock', i.stock,
          'department', i.department,
          'barcode', i.barcode,
          'purchase_units', (
            select coalesce(
              jsonb_agg(jsonb_build_object('unitName', u.unit_name, 'conversion', u.conversion) order by u.unit_name asc),
              '[]'::jsonb
            )
            from public.ingredient_purchase_units u
            where u.ingredient_id = i.id
          )
        )
        order by i.name asc
      ),
      '[]'::jsonb
    )
    into v_items
    from public.ingredients i
    where i.business_id = v_business.id and i.deleted_at is null;
  else
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', p.id, 'name', p.name, 'unit', 'pcs', 'stock', p.stock, 'department', null, 'barcode', p.barcode, 'purchase_units', '[]'::jsonb)
        order by p.name asc
      ),
      '[]'::jsonb
    )
    into v_items
    from public.products p
    where p.business_id = v_business.id and p.deleted_at is null;
  end if;

  return jsonb_build_object(
    'business_id', v_business.id,
    'business_name', v_business.name,
    'business_type', v_business.business_type,
    'employees', v_employees,
    'items', v_items,
    'stock_locations', v_locations
  );
end;
$$;
