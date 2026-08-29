-- Portal Lokasi: tambahkan "Minta Bahan ke Dapur Produksi" buat Kitchen/Bar
-- -- kebutuhan lokasi non-produksi/non-Gudang itu 2 hal beda (sempat
-- ketuker sebelumnya): (1) minta bahan baku/dagang ke Purchasing =
-- Permintaan Barang (sudah ada di portal), (2) minta Bahan Setengah Jadi ke
-- Dapur Produksi = Transfer Internal (`/transfer-internal/[slug]`, sudah
-- ada sbg link publik berdiri sendiri, TAPI belum masuk Portal Lokasi).
-- Reuse RPC publik yang sudah ada (get_location_transfer_info/
-- submit_location_transfer_request) -- cuma slug-nya (location_transfer_slug)
-- perlu ikut dibalikin get_location_portal_home.
create or replace function public.get_location_portal_home(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location record;
  v_business record;
  v_employees jsonb;
  v_pending_transfer_count int;
  v_pending_receive_count int;
begin
  select id, business_id, name, is_production, is_default_purchase into v_location
  from public.stock_locations
  where portal_slug = p_slug;
  if not found then
    return null;
  end if;

  select id, name, stock_opname_slug, receive_stock_slug, production_scan_slug, purchase_request_slug, location_transfer_slug into v_business
  from public.businesses
  where id = v_location.business_id;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name) order by e.name asc),
    '[]'::jsonb
  )
  into v_employees
  from public.employees e
  where e.business_id = v_business.id and e.location_id = v_location.id and e.active = true;

  select count(*) into v_pending_transfer_count
  from public.location_transfers t
  where t.business_id = v_business.id and t.from_location_id = v_location.id and t.status = 'baru';

  select count(*) into v_pending_receive_count
  from public.purchase_request_item_stock_fulfillments f
  join public.purchase_request_items pri on pri.id = f.purchase_request_item_id
  join public.purchase_requests pr on pr.id = pri.purchase_request_id
  where f.business_id = v_business.id and f.received_at is null and pr.location_id = v_location.id;

  return jsonb_build_object(
    'business_id', v_business.id,
    'business_name', v_business.name,
    'stock_opname_slug', v_business.stock_opname_slug,
    'receive_stock_slug', v_business.receive_stock_slug,
    'production_scan_slug', v_business.production_scan_slug,
    'purchase_request_slug', v_business.purchase_request_slug,
    'location_transfer_slug', v_business.location_transfer_slug,
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

grant execute on function public.get_location_portal_home(text) to anon, authenticated;
