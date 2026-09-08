-- Link publik read-only buat cek HPP menu -- dikirim ke tim Dapur/Bar biar
-- mereka bisa lihat Harga Jual/HPP/Margin tanpa perlu login ke backoffice.
-- Sengaja TIDAK ekspos resep/bahan (cuma angka ringkasan per menu) dan TIDAK
-- ada aksi tulis apapun -- pola sama dengan link publik lain (stok opname,
-- self-order, dst): kolom slug di businesses + RPC security definer yang
-- di-grant ke anon.
alter table public.businesses
  add column if not exists hpp_menu_slug text unique;

create or replace function public.get_hpp_menu_info(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_products jsonb;
begin
  select id, name
  into v_business
  from public.businesses
  where hpp_menu_slug = p_slug;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'category', p.category,
        'department', p.department,
        'price', p.price,
        'cost', p.cost,
        'hpp_checked', p.hpp_checked,
        'updated_at', p.updated_at
      )
      order by p.name asc
    ),
    '[]'::jsonb
  )
  into v_products
  from public.products p
  where p.business_id = v_business.id and p.deleted_at is null;

  return jsonb_build_object(
    'business_id', v_business.id,
    'business_name', v_business.name,
    'products', v_products
  );
end;
$$;

grant execute on function public.get_hpp_menu_info(text) to anon, authenticated;
