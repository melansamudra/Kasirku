-- Module 5 (lanjutan): self-order publik. Pelanggan yang scan QR meja tidak
-- punya akun, jadi akses menu dan pengiriman order lewat dua RPC security
-- definer yang di-grant ke anon. qr_slug yang acak berperan sebagai
-- kapabilitas akses — tanpa slug yang valid kedua fungsi tidak mengembalikan
-- apa pun. Harga/nama item selalu di-snapshot dari public.products di sisi
-- server, tidak pernah dipercaya dari client.

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
  select t.id, t.name, t.business_id, b.name as business_name
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
        'in_stock', p.stock > 0
      )
      order by p.category nulls last, p.name
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
    'products', v_products
  );
end;
$$;

grant execute on function public.get_self_order_menu(text) to anon, authenticated;

-- Submit -----------------------------------------------------------------

create or replace function public.submit_self_order(
  p_qr_slug text,
  p_items jsonb -- array of {product_id, qty, note}
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table record;
  v_order_id uuid;
  v_item jsonb;
  v_product record;
  v_qty numeric(12, 2);
begin
  select t.id, t.business_id
  into v_table
  from public.tables t
  where t.qr_slug = p_qr_slug;

  if not found then
    raise exception 'table not found';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'order is empty';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'too many items';
  end if;

  insert into public.self_orders (business_id, table_id, status)
  values (v_table.business_id, v_table.id, 'baru')
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'qty')::numeric;

    if v_qty is null or v_qty <= 0 or v_qty > 99 then
      raise exception 'invalid quantity';
    end if;

    select p.id, p.name, p.price
    into v_product
    from public.products p
    where p.id = (v_item ->> 'product_id')::uuid
      and p.business_id = v_table.business_id
      and p.deleted_at is null;

    if not found then
      raise exception 'product not found';
    end if;

    insert into public.self_order_items (self_order_id, product_id, name, price, qty, note)
    values (
      v_order_id,
      v_product.id,
      v_product.name,
      v_product.price,
      v_qty,
      nullif(left(trim(v_item ->> 'note'), 200), '')
    );
  end loop;

  return v_order_id;
end;
$$;

grant execute on function public.submit_self_order(text, jsonb) to anon, authenticated;
