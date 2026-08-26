-- Barcode bahan baku — sama pola dengan products.barcode, supaya
-- Permintaan Gudang bisa diisi lewat scan barcode gun (bekerja seperti
-- keyboard: ketik kode + Enter) alih-alih cuma pilih dari dropdown.
alter table public.ingredients add column barcode text;

create unique index ingredients_business_id_barcode_key
  on public.ingredients (business_id, barcode)
  where barcode is not null and deleted_at is null;

-- get_warehouse_request_info ikut kirim barcode per bahan, supaya form
-- publik Permintaan Gudang bisa cocokkan hasil scan.
create or replace function public.get_warehouse_request_info(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_warehouses jsonb;
  v_employees jsonb;
  v_items jsonb;
begin
  select id, name
  into v_business
  from public.businesses
  where warehouse_request_slug = p_slug and cost_control_enabled = true;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name) order by w.name asc),
    '[]'::jsonb
  )
  into v_warehouses
  from public.warehouses w
  where w.business_id = v_business.id and w.kind = 'bahan_baku';

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
        'id', i.id, 'name', i.name, 'unit', i.unit, 'warehouseId', i.warehouse_id, 'barcode', i.barcode
      )
      order by i.name asc
    ),
    '[]'::jsonb
  )
  into v_items
  from public.ingredients i
  where i.business_id = v_business.id and i.deleted_at is null and i.warehouse_id is not null;

  return jsonb_build_object(
    'business_id', v_business.id,
    'business_name', v_business.name,
    'warehouses', v_warehouses,
    'employees', v_employees,
    'items', v_items
  );
end;
$$;

grant execute on function public.get_warehouse_request_info(text) to anon, authenticated;
