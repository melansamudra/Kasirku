-- Perluasan get_hpp_menu_info (20260909120000) -- tim Dapur/Bar yang buka
-- link publik ini perlu lihat RESEP per menu juga (bahan & takarannya),
-- bukan cuma angka total HPP, supaya bisa cek "udah pas belum ingredient-nya"
-- langsung dari link tanpa login. Tetap read-only, tidak ada endpoint tulis.
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
        'updated_at', p.updated_at,
        'recipe', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'ingredient_name', i.name,
                'qty', pr.qty,
                'unit', pr.unit,
                'unit_cost', i.unit_cost
              )
              order by i.name asc
            ),
            '[]'::jsonb
          )
          from public.product_recipes pr
          join public.ingredients i on i.id = pr.ingredient_id
          where pr.product_id = p.id
        )
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
