-- Permintaan Barang: staf dapur/bar/front isi order barang yang mau dibeli
-- (qty + stok fisik yang mereka lihat sendiri) lewat link publik tanpa login
-- (sama pola dengan /absen), admin lihat masuk, tandai diterima, pilih
-- supplier, lalu teruskan (kirim WA) ke supplier. Ini terpisah dari
-- public.purchases (yang mencatat pembelian yang SUDAH terjadi dengan
-- nominal & pembayaran) — fitur ini ada SEBELUM pembelian itu terjadi.

create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete set null,
  employee_name text not null,
  status text not null default 'baru' check (status in ('baru', 'diterima', 'diteruskan')),
  supplier_id uuid references public.suppliers (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  received_at timestamptz,
  forwarded_at timestamptz
);

create index purchase_requests_business_id_idx on public.purchase_requests (business_id, created_at desc);

alter table public.purchase_requests enable row level security;

create policy "Owner manages purchase requests of own businesses"
on public.purchase_requests for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

create table public.purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  purchase_request_id uuid not null references public.purchase_requests (id) on delete cascade,
  item_type text not null check (item_type in ('ingredient', 'product')),
  ingredient_id uuid references public.ingredients (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  item_name text not null,
  unit text,
  qty_ordered numeric(12, 2) not null check (qty_ordered > 0),
  current_stock numeric(12, 2),
  created_at timestamptz not null default now()
);

create index purchase_request_items_request_id_idx on public.purchase_request_items (purchase_request_id);

alter table public.purchase_request_items enable row level security;

create policy "Owner manages purchase request items of own businesses"
on public.purchase_request_items for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Token akses link publik "Order Barang" — satu per bisnis, sama pola
-- dengan attendance_qr_slug (bukan per meja/per staf, satu link dipasang
-- buat dipakai semua staf dapur/bar/front).
alter table public.businesses add column purchase_request_slug text unique;

update public.businesses
set purchase_request_slug = encode(extensions.gen_random_bytes(9), 'hex')
where purchase_request_slug is null;

-- RPC baca: nama toko + karyawan aktif + daftar item master (ingredients
-- kalau fnb, products kalau bukan) buat dropdown pemilihan di form staf.
-- Sama pola dengan get_attendance_checkin_info (security definer, business
-- di-resolve dari slug DI DALAM fungsi).
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
        jsonb_build_object('id', i.id, 'name', i.name, 'unit', i.unit, 'stock', i.stock)
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

grant execute on function public.get_purchase_request_info(text) to anon, authenticated;

-- RPC tulis: submit order. Kalau item belum ada di master data (staf ketik
-- nama baru, ingredientId/productId dikosongkan), fungsi ini BUAT baris baru
-- di ingredients/products (stok 0, biar admin lengkapi harga belakangan) lalu
-- langsung dipakai di item order ini — sesuai "belum ada bisa input dan
-- disave".
create or replace function public.submit_purchase_request(
  p_slug text,
  p_employee_id uuid,
  p_note text,
  p_items jsonb -- array of {itemId, newItemName, unit, qtyOrdered, currentStock}
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_employee record;
  v_request_id uuid;
  v_item jsonb;
  v_qty numeric(12, 2);
  v_current_stock numeric(12, 2);
  v_item_id uuid;
  v_item_name text;
  v_unit text;
  v_new_name text;
begin
  select id, business_type
  into v_business
  from public.businesses
  where purchase_request_slug = p_slug;

  if not found then
    raise exception 'business not found';
  end if;

  select id, name
  into v_employee
  from public.employees
  where id = p_employee_id and business_id = v_business.id and active = true;

  if not found then
    raise exception 'employee not found';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'request is empty';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'too many items';
  end if;

  insert into public.purchase_requests (business_id, employee_id, employee_name, note, status)
  values (v_business.id, v_employee.id, v_employee.name, nullif(left(trim(p_note), 500), ''), 'baru')
  returning id into v_request_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'qtyOrdered')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 999999 then
      raise exception 'invalid quantity';
    end if;

    v_current_stock := nullif(v_item ->> 'currentStock', '')::numeric;
    v_new_name := nullif(trim(v_item ->> 'newItemName'), '');

    if v_new_name is not null then
      if v_business.business_type = 'fnb' then
        v_unit := coalesce(nullif(trim(v_item ->> 'unit'), ''), 'pcs');

        insert into public.ingredients (business_id, name, unit, stock, min_stock, unit_cost)
        values (v_business.id, left(v_new_name, 200), v_unit, 0, 0, 0)
        returning id, name, unit into v_item_id, v_item_name, v_unit;

        insert into public.purchase_request_items
          (business_id, purchase_request_id, item_type, ingredient_id, item_name, unit, qty_ordered, current_stock)
        values
          (v_business.id, v_request_id, 'ingredient', v_item_id, v_item_name, v_unit, v_qty, v_current_stock);
      else
        insert into public.products (business_id, name, stock, min_stock, cost, price)
        values (v_business.id, left(v_new_name, 200), 0, 0, 0, 0)
        returning id, name into v_item_id, v_item_name;

        insert into public.purchase_request_items
          (business_id, purchase_request_id, item_type, product_id, item_name, unit, qty_ordered, current_stock)
        values
          (v_business.id, v_request_id, 'product', v_item_id, v_item_name, 'pcs', v_qty, v_current_stock);
      end if;
    else
      if v_business.business_type = 'fnb' then
        select id, name, unit into v_item_id, v_item_name, v_unit
        from public.ingredients
        where id = (v_item ->> 'itemId')::uuid and business_id = v_business.id and deleted_at is null;

        if not found then
          raise exception 'item not found';
        end if;

        insert into public.purchase_request_items
          (business_id, purchase_request_id, item_type, ingredient_id, item_name, unit, qty_ordered, current_stock)
        values
          (v_business.id, v_request_id, 'ingredient', v_item_id, v_item_name, v_unit, v_qty, v_current_stock);
      else
        select id, name into v_item_id, v_item_name
        from public.products
        where id = (v_item ->> 'itemId')::uuid and business_id = v_business.id and deleted_at is null;

        if not found then
          raise exception 'item not found';
        end if;

        insert into public.purchase_request_items
          (business_id, purchase_request_id, item_type, product_id, item_name, unit, qty_ordered, current_stock)
        values
          (v_business.id, v_request_id, 'product', v_item_id, v_item_name, 'pcs', v_qty, v_current_stock);
      end if;
    end if;
  end loop;

  return v_request_id;
end;
$$;

grant execute on function public.submit_purchase_request(text, uuid, text, jsonb) to anon, authenticated;
