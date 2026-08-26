-- "Gudang minta barang" — form permintaan resmi dari Gudang Kering/Basah ke
-- Purchasing, sama pola dengan Permintaan Resto (link publik tanpa login +
-- inbox admin) tapi TANPA gerbang approval terpisah (owner sudah
-- konfirmasi: gudang selalu langsung diproses) — "Siapkan" di inbox
-- sekaligus jadi eksekusi (pindahkan stok dari buffer Gudang Purchasing ke
-- ingredients.stock gudang tujuan), bukan cuma menandai status.
-- "ditolak" tetap ada untuk kasus buffer tidak cukup.

alter table public.businesses
  add column warehouse_request_slug text unique default encode(extensions.gen_random_bytes(9), 'hex');

update public.businesses
set warehouse_request_slug = encode(extensions.gen_random_bytes(9), 'hex')
where warehouse_request_slug is null;

create table public.warehouse_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  warehouse_id uuid references public.warehouses (id) on delete set null,
  warehouse_name text not null,
  employee_id uuid references public.employees (id) on delete set null,
  employee_name text not null,
  status text not null default 'baru' check (status in ('baru', 'disiapkan', 'ditolak')),
  note text,
  reject_reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index warehouse_requests_business_id_idx on public.warehouse_requests (business_id, created_at desc);

alter table public.warehouse_requests enable row level security;

create policy "Owner manages warehouse requests of own businesses"
on public.warehouse_requests for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

create table public.warehouse_request_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  warehouse_request_id uuid not null references public.warehouse_requests (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  item_name text not null,
  unit text not null,
  qty_requested numeric(12, 2) not null check (qty_requested > 0),
  qty_fulfilled numeric(12, 2),
  created_at timestamptz not null default now()
);

create index warehouse_request_items_request_id_idx on public.warehouse_request_items (warehouse_request_id);

alter table public.warehouse_request_items enable row level security;

create policy "Owner manages warehouse request items of own businesses"
on public.warehouse_request_items for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- RPC baca: nama toko + gudang bahan baku (kering/basah) + karyawan aktif +
-- katalog bahan baku yang sudah ditandai ke gudang (warehouse_id not null).
create or replace function public.get_warehouse_request_info(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_warehouses jsonb;
  v_employees jsonb;
  v_items jsonb;
begin
  select id, name
  into v_business
  from public.businesses
  where warehouse_request_slug = p_slug and cost_control_enabled = true;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name) order by w.name asc),
    '[]'::jsonb
  )
  into v_warehouses
  from public.warehouses w
  where w.business_id = v_business.id and w.kind = 'bahan_baku';

  select coalesce(
    jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name) order by e.created_at asc),
    '[]'::jsonb
  )
  into v_employees
  from public.employees e
  where e.business_id = v_business.id and e.active = true;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', i.id, 'name', i.name, 'unit', i.unit, 'warehouseId', i.warehouse_id)
      order by i.name asc
    ),
    '[]'::jsonb
  )
  into v_items
  from public.ingredients i
  where i.business_id = v_business.id and i.deleted_at is null and i.warehouse_id is not null;

  return jsonb_build_object(
    'business_id', v_business.id,
    'business_name', v_business.name,
    'warehouses', v_warehouses,
    'employees', v_employees,
    'items', v_items
  );
end;
$$;

grant execute on function public.get_warehouse_request_info(text) to anon, authenticated;

-- RPC tulis: submit permintaan gudang. Bahan yang boleh diminta harus sudah
-- ditandai ke gudang tujuan yang sama (warehouse_id cocok) — mencegah salah
-- kirim ke gudang yang bukan pemiliknya.
create or replace function public.submit_warehouse_request(
  p_slug text,
  p_warehouse_id uuid,
  p_employee_id uuid,
  p_note text,
  p_items jsonb -- array of {itemId, qtyRequested}
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_warehouse record;
  v_employee record;
  v_request_id uuid;
  v_item jsonb;
  v_qty numeric(12, 2);
  v_item_id uuid;
  v_item_name text;
  v_unit text;
begin
  select id
  into v_business
  from public.businesses
  where warehouse_request_slug = p_slug and cost_control_enabled = true;

  if not found then
    raise exception 'business not found';
  end if;

  select id, name
  into v_warehouse
  from public.warehouses
  where id = p_warehouse_id and business_id = v_business.id and kind = 'bahan_baku';

  if not found then
    raise exception 'warehouse not found';
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

  insert into public.warehouse_requests
    (business_id, warehouse_id, warehouse_name, employee_id, employee_name, note, status)
  values
    (v_business.id, v_warehouse.id, v_warehouse.name, v_employee.id, v_employee.name,
     nullif(left(trim(coalesce(p_note, '')), 500), ''), 'baru')
  returning id into v_request_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'qtyRequested')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 999999 then
      raise exception 'invalid quantity';
    end if;

    select id, name, unit into v_item_id, v_item_name, v_unit
    from public.ingredients
    where id = (v_item ->> 'itemId')::uuid
      and business_id = v_business.id
      and deleted_at is null
      and warehouse_id = v_warehouse.id;

    if not found then
      raise exception 'item not found';
    end if;

    insert into public.warehouse_request_items
      (business_id, warehouse_request_id, ingredient_id, item_name, unit, qty_requested)
    values
      (v_business.id, v_request_id, v_item_id, v_item_name, v_unit, v_qty);
  end loop;

  return v_request_id;
end;
$$;

grant execute on function public.submit_warehouse_request(text, uuid, uuid, text, jsonb) to anon, authenticated;
