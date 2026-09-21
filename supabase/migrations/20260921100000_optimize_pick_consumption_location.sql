-- Optimisasi murni performa, TANPA mengubah perilaku sama sekali.
-- private.pick_consumption_location() (dipakai checkout_transaction,
-- create_manual_transaction, import_esb_sales_bulk -- dipanggil sekali per
-- baris resep per item keranjang) melakukan 2 SELECT terpisah ke
-- ingredient_location_stock untuk hal yang sama: sekali count(distinct
-- location_id), sekali lagi select location_id-nya. Digabung jadi 1 query
-- pakai window function count(*) over() -- separuh jumlah statement di
-- jalur checkout, tanpa mengubah satu pun keputusan lokasi yang dihasilkan.
create or replace function private.pick_consumption_location(
  p_business_id uuid,
  p_ingredient_id uuid,
  p_product_category text,
  p_default_location_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_location_id uuid;
  v_location_count int;
begin
  if p_product_category is not null then
    select sl.id into v_location_id
    from public.stock_locations sl
    where sl.business_id = p_business_id
      and p_product_category = any(sl.product_categories)
    limit 1;

    if v_location_id is not null then
      return v_location_id;
    end if;
  end if;

  select location_id, count(*) over () into v_location_id, v_location_count
  from public.ingredient_location_stock
  where business_id = p_business_id and ingredient_id = p_ingredient_id and stock > 0
  limit 1;

  if v_location_count = 1 then
    return v_location_id;
  end if;

  return p_default_location_id;
end;
$$;

select pg_notify('pgrst', 'reload schema');
