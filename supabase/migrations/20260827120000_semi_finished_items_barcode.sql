-- Barcode bahan setengah jadi — sama pola dengan ingredients.barcode, supaya
-- link publik Permintaan Resto bisa diisi lewat scan barcode gun (bekerja
-- seperti keyboard: ketik kode + Enter) alih-alih cuma pilih dari dropdown.
alter table public.semi_finished_items add column barcode text;

create unique index semi_finished_items_business_id_barcode_key
  on public.semi_finished_items (business_id, barcode)
  where barcode is not null and deleted_at is null;

-- get_outlet_request_info ikut kirim barcode per item, supaya form publik
-- Permintaan Resto bisa cocokkan hasil scan.
create or replace function public.get_outlet_request_info(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_outlets jsonb;
  v_employees jsonb;
  v_items jsonb;
begin
  select id, name
  into v_business
  from public.businesses
  where outlet_request_slug = p_slug and cost_control_enabled = true;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) order by o.name asc),
    '[]'::jsonb
  )
  into v_outlets
  from public.outlets o
  where o.business_id = v_business.id and o.active = true;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name) order by e.created_at asc),
    '[]'::jsonb
  )
  into v_employees
  from public.employees e
  where e.business_id = v_business.id and e.active = true;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', s.id, 'name', s.name, 'unit', s.unit, 'stock', s.stock, 'barcode', s.barcode)
      order by s.name asc
    ),
    '[]'::jsonb
  )
  into v_items
  from public.semi_finished_items s
  where s.business_id = v_business.id and s.deleted_at is null;

  return jsonb_build_object(
    'business_id', v_business.id,
    'business_name', v_business.name,
    'outlets', v_outlets,
    'employees', v_employees,
    'items', v_items
  );
end;
$$;
