-- Link publik untuk Stock Opname versi FLAT (tanpa stock_locations, lihat
-- 20260909150000) -- staf scan/buka link, pilih tanggal & divisi, isi stok
-- fisik, submit jadi entri "pending" (sama sekali tidak mengubah
-- ingredients.stock -- konsisten dengan alur backoffice-nya). Reuse kolom
-- businesses.stock_opname_slug yang sudah ada (dipakai juga oleh portal
-- Llauk yang per-lokasi) -- satu bisnis cuma butuh satu slug, halaman mana
-- yang dituju ditentukan dari ada/tidaknya stock_locations, bukan dari
-- slug yang berbeda.

create or replace function public.get_ingredient_opname_info(p_slug text)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_business record;
  v_ingredients jsonb;
begin
  select id, name into v_business
  from public.businesses
  where stock_opname_slug = p_slug;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'name', i.name,
        'unit', i.unit,
        'stock', i.stock,
        'departments', coalesce(i.departments, '{}')
      )
      order by i.name asc
    ),
    '[]'::jsonb
  )
  into v_ingredients
  from public.ingredients i
  where i.business_id = v_business.id and i.deleted_at is null;

  return jsonb_build_object(
    'business_id', v_business.id,
    'business_name', v_business.name,
    'ingredients', v_ingredients
  );
end;
$$;

grant execute on function public.get_ingredient_opname_info(text) to anon, authenticated;

create or replace function public.submit_ingredient_opname(
  p_slug text,
  p_entry_date date,
  p_submitted_by_name text,
  p_items jsonb -- array of {ingredient_id, reported_stock}
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_item jsonb;
  v_ingredient record;
  v_count int := 0;
begin
  select id into v_business_id
  from public.businesses
  where stock_opname_slug = p_slug;

  if v_business_id is null then
    raise exception 'toko tidak ditemukan';
  end if;
  if p_entry_date is null then
    raise exception 'tanggal wajib diisi';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'isi minimal satu bahan';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select id, stock into v_ingredient
    from public.ingredients
    where id = (v_item ->> 'ingredient_id')::uuid and business_id = v_business_id and deleted_at is null;

    if not found then
      continue;
    end if;

    insert into public.ingredient_opname_entries (
      business_id, ingredient_id, entry_date, reported_stock, system_stock_at_report, submitted_by_name
    ) values (
      v_business_id,
      v_ingredient.id,
      p_entry_date,
      (v_item ->> 'reported_stock')::numeric,
      v_ingredient.stock,
      nullif(trim(coalesce(p_submitted_by_name, '')), '')
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.submit_ingredient_opname(text, date, text, jsonb) to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
