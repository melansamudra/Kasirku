-- Produk unggulan di halaman self-order
alter table public.products add column if not exists featured boolean default false;

-- Banner/iklan di atas halaman self-order (teks singkat, html tidak diizinkan)
alter table public.businesses add column if not exists self_order_banner text;

-- Update RPC: tambah featured, image_url, self_order_banner, dan sort unggulan ke atas
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
  v_banner text;
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
        'in_stock', p.stock > 0
      )
      order by (coalesce(p.featured, false)) desc, p.category nulls last, p.name
    ),
    '[]'::jsonb
  )
  into v_products
  from public.products p
  where p.business_id = v_table.business_id
    and p.deleted_at is null;

  return jsonb_build_object(
    'table_name', v_table.name,
    'business_name', v_table.business_name,
    'self_order_banner', v_table.banner,
    'products', v_products
  );
end;
$$;

grant execute on function public.get_self_order_menu(text) to anon, authenticated;
