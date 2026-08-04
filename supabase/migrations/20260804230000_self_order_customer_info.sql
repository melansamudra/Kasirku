-- Tambah data pelanggan dan metode bayar ke self_orders
alter table public.self_orders
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists payment_method text default 'kasir';

-- Update submit_self_order untuk terima data pelanggan
create or replace function public.submit_self_order(
  p_qr_slug text,
  p_items jsonb,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_payment_method text default 'kasir'
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

  insert into public.self_orders (
    business_id, table_id, status,
    customer_name, customer_phone, payment_method
  )
  values (
    v_table.business_id, v_table.id, 'baru',
    nullif(trim(p_customer_name), ''),
    nullif(trim(p_customer_phone), ''),
    coalesce(p_payment_method, 'kasir')
  )
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

grant execute on function public.submit_self_order(text, jsonb, text, text, text) to anon, authenticated;
