-- get_purchase_request_info ikut kirim barcode per barang, supaya form
-- publik "Order Barang" (Permintaan Barang) bisa diisi lewat scan barcode
-- gun, sama pola dengan Permintaan Gudang.
create or replace function public.get_purchase_request_info(p_slug text)
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
begin
  select id, name, business_type
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
    'items', v_items
  );
end;
$$;
