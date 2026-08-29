-- Portal Lokasi: tambahkan Produksi & Permintaan Barang ke Home Portal --
-- keduanya reuse RPC publik yang sudah ada (get_production_scan_info/
-- submit_production_scan, get_purchase_request_info/submit_purchase_request),
-- cuma butuh slug-nya ikut dibalikin get_location_portal_home biar Home bisa
-- tau slug apa yang harus dipanggil buat lokasi ini.
create or replace function public.get_location_portal_home(p_slug text, p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_location record;
  v_employees jsonb;
  v_pending_transfer_count int;
  v_pending_receive_count int;
begin
  select id, name, stock_opname_slug, receive_stock_slug, production_scan_slug, purchase_request_slug into v_business
  from public.businesses
  where location_portal_slug = p_slug;
  if not found then
    return null;
  end if;

  select id, name, is_production, is_default_purchase into v_location
  from public.stock_locations
  where id = p_location_id and business_id = v_business.id;
  if not found then
    return jsonb_build_object('business_id', v_business.id, 'business_name', v_business.name, 'location', null);
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name) order by e.name asc),
    '[]'::jsonb
  )
  into v_employees
  from public.employees e
  where e.business_id = v_business.id and e.location_id = p_location_id and e.active = true;

  select count(*) into v_pending_transfer_count
  from public.location_transfers t
  where t.business_id = v_business.id and t.from_location_id = p_location_id and t.status = 'baru';

  select count(*) into v_pending_receive_count
  from public.purchase_request_item_stock_fulfillments f
  join public.purchase_request_items pri on pri.id = f.purchase_request_item_id
  join public.purchase_requests pr on pr.id = pri.purchase_request_id
  where f.business_id = v_business.id and f.received_at is null and pr.location_id = p_location_id;

  return jsonb_build_object(
    'business_id', v_business.id,
    'business_name', v_business.name,
    'stock_opname_slug', v_business.stock_opname_slug,
    'receive_stock_slug', v_business.receive_stock_slug,
    'production_scan_slug', v_business.production_scan_slug,
    'purchase_request_slug', v_business.purchase_request_slug,
    'location', jsonb_build_object(
      'id', v_location.id,
      'name', v_location.name,
      'is_production', v_location.is_production,
      'is_default_purchase', v_location.is_default_purchase
    ),
    'employees', v_employees,
    'pending_transfer_count', v_pending_transfer_count,
    'pending_receive_count', v_pending_receive_count
  );
end;
$$;

grant execute on function public.get_location_portal_home(text, uuid) to anon, authenticated;
