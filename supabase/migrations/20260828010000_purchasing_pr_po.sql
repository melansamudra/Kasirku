-- Alur Purchasing PR -> PO (+ RAB Bulanan), Fase 1 -- lihat memo internal
-- Cost Control Llauk Nusantara 001/MEMO-CC/VIII/2026. "Permintaan Barang"
-- yang sudah ada (purchase_requests/items/allocations) DIPAKAI ULANG sebagai
-- PR -- cuma ditambah nomor dokumen + gerbang approval budget.
-- forwardAllocationsToSupplier (kelompokkan alokasi per supplier) jadi
-- momen PO diterbitkan -- entitas purchase_orders baru dibuat dari situ.

-- ---- RAB bulanan per bisnis ----
create table public.procurement_budgets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  period text not null, -- 'YYYY-MM'
  amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, period)
);
alter table public.procurement_budgets enable row level security;
create policy "Owner manages procurement budgets of own businesses"
on public.procurement_budgets for all
using (private.owns_business(business_id)) with check (private.owns_business(business_id));

-- ---- PR: nomor dokumen + gerbang approval budget ----
alter table public.purchase_requests
  add column pr_number text,
  add column budget_status text not null default 'pending'
    check (budget_status in ('pending', 'approved_in_budget', 'rejected')),
  add column budget_approved_by text,
  add column budget_approved_at timestamptz,
  add column budget_note text;

-- ---- PO: entitas baru, diterbitkan dari alokasi yang di-forward ke 1 supplier ----
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  po_number text not null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  purchase_request_id uuid references public.purchase_requests (id) on delete set null,
  status text not null default 'issued' check (status in ('issued', 'approved', 'rejected')),
  total_amount numeric(14, 2) not null default 0,
  issued_by text,
  approved_by text,
  approved_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  item_name text not null,
  unit text not null,
  qty numeric(12, 2) not null,
  unit_price numeric(14, 2) not null default 0,
  subtotal numeric(14, 2) not null default 0
);
alter table public.purchase_request_item_allocations
  add column purchase_order_id uuid references public.purchase_orders (id) on delete set null;

create index purchase_orders_business_id_idx on public.purchase_orders (business_id);
create index purchase_order_items_po_id_idx on public.purchase_order_items (purchase_order_id);

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
create policy "Owner manages purchase orders of own businesses"
on public.purchase_orders for all
using (private.owns_business(business_id)) with check (private.owns_business(business_id));
create policy "Owner manages purchase order items of own businesses"
on public.purchase_order_items for all
using (private.owns_business(business_id)) with check (private.owns_business(business_id));

-- ---- submit_purchase_request: isi pr_number otomatis saat PR dibuat ----
create or replace function public.submit_purchase_request(
  p_slug text,
  p_employee_id uuid,
  p_note text,
  p_items jsonb, -- array of {itemId, newItemName, unit, qtyOrdered, currentStock}
  p_location_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_employee record;
  v_location_id uuid;
  v_request_id uuid;
  v_pr_number text;
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

  if p_location_id is not null then
    select id into v_location_id
    from public.stock_locations
    where id = p_location_id and business_id = v_business.id;
  else
    v_location_id := null;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'request is empty';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'too many items';
  end if;

  v_pr_number := 'PR-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random() * 999999))::text, 6, '0');

  insert into public.purchase_requests (business_id, employee_id, employee_name, note, status, location_id, pr_number)
  values (v_business.id, v_employee.id, v_employee.name, nullif(left(trim(p_note), 500), ''), 'baru', v_location_id, v_pr_number)
  returning id into v_request_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'qtyOrdered')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 999999 then
      raise exception 'invalid quantity';
    end if;

    v_current_stock := nullif(v_item ->> 'currentStock', '')::numeric;
    v_new_name := nullif(trim(v_item ->> 'newItemName'), '');
    v_unit := coalesce(nullif(trim(v_item ->> 'unit'), ''), null);

    if v_new_name is not null then
      if v_business.business_type = 'fnb' then
        insert into public.ingredients (business_id, name, unit, stock, min_stock, unit_cost)
        values (v_business.id, left(v_new_name, 200), coalesce(v_unit, 'pcs'), 0, 0, 0)
        returning id, name into v_item_id, v_item_name;

        insert into public.purchase_request_items
          (business_id, purchase_request_id, item_type, ingredient_id, item_name, unit, qty_ordered, current_stock)
        values
          (v_business.id, v_request_id, 'ingredient', v_item_id, v_item_name, coalesce(v_unit, 'pcs'), v_qty, v_current_stock);
      else
        insert into public.products (business_id, name, stock, min_stock, cost, price)
        values (v_business.id, left(v_new_name, 200), 0, 0, 0, 0)
        returning id, name into v_item_id, v_item_name;

        insert into public.purchase_request_items
          (business_id, purchase_request_id, item_type, product_id, item_name, unit, qty_ordered, current_stock)
        values
          (v_business.id, v_request_id, 'product', v_item_id, v_item_name, coalesce(v_unit, 'pcs'), v_qty, v_current_stock);
      end if;
    else
      if v_business.business_type = 'fnb' then
        select id, name into v_item_id, v_item_name
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
          (v_business.id, v_request_id, 'product', v_item_id, v_item_name, coalesce(v_unit, 'pcs'), v_qty, v_current_stock);
      end if;
    end if;
  end loop;

  return v_request_id;
end;
$$;

-- PR yang sudah ada sebelum fitur ini (belum punya pr_number) diberi nomor
-- retroaktif berbasis created_at, supaya halaman cetak PR tetap punya nomor.
update public.purchase_requests
set pr_number = 'PR-' || to_char(created_at, 'YYYYMMDD') || '-' || lpad((floor(random() * 999999))::text, 6, '0')
where pr_number is null;
