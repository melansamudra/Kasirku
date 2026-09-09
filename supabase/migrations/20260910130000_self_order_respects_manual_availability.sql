-- in_stock kembali dipakai di self-order, tapi BUKAN dari angka stok (itu
-- keputusan lama di 20260804220000 tetap berlaku -- POS/self-order tidak
-- gating dari stock numerik). Sumbernya sekarang toggle manual "Habis" yang
-- baru ditambahkan di kasir (products.available) -- kalau kasir tandai
-- suatu menu habis, pelanggan yang scan QR juga tidak bisa pesan menu itu.
create or replace function public.get_self_order_menu(p_qr_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_table record;
  v_products jsonb;
begin
  select t.id, t.name, t.business_id, b.name as business_name, b.self_order_banner as banner
  into v_table
  from public.tables t
  join public.businesses b on b.id = t.business_id
  where t.qr_slug = p_qr_slug;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'category', p.category,
        'price', p.price,
        'emoji', p.emoji,
        'image_url', p.image_url,
        'featured', coalesce(p.featured, false),
        'in_stock', coalesce(p.available, true)
      )
      order by coalesce(p.sort_order, 0) asc, p.name asc
    ),
    '[]'::jsonb
  )
  into v_products
  from public.products p
  where p.business_id = v_table.business_id
    and p.deleted_at is null
    and coalesce(p.show_in_self_order, true) = true;

  return jsonb_build_object(
    'table_name', v_table.name,
    'business_name', v_table.business_name,
    'self_order_banner', v_table.banner,
    'products', v_products
  );
end;
$$;

select pg_notify('pgrst', 'reload schema');
