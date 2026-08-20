-- Satuan pembelian beda dari satuan stok/HPP — mis. beli dalam "Sak" tapi
-- stok & HPP dihitung dalam "gram". Opsional per bahan: kalau diisi, form
-- Pembelian & Hutang dan form order di Permintaan Barang bisa nawarin toggle
-- "beli dalam satuan beli" yang otomatis dikonversi ke satuan stok. Kalau
-- kosong, semuanya jalan seperti sebelumnya (qty langsung dalam satuan stok).
alter table public.ingredients
  add column purchase_unit text,
  add column purchase_conversion numeric(12, 4) check (purchase_conversion is null or purchase_conversion > 0);

-- Form order publik di Permintaan Barang juga perlu tahu satuan beli bahan,
-- biar staf bisa input "2 Sak" bukan cuma "50000 gram" — RPC-nya diganti
-- supaya ikut kirim purchase_unit & purchase_conversion per bahan.
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
          'purchase_unit', i.purchase_unit,
          'purchase_conversion', i.purchase_conversion
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
        jsonb_build_object('id', p.id, 'name', p.name, 'unit', 'pcs', 'stock', p.stock)
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
