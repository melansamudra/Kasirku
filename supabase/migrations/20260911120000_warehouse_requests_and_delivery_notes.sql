-- Permintaan Barang + Surat Jalan KHUSUS Gudang standalone (warehouse_mode
-- = 'standalone', lihat migrasi warehouse_standalone_mode). Sengaja TABEL &
-- RPC BARU, bukan reuse purchase_requests (terikat ingredient_id + gerbang
-- budget/Cost Control -- lihat permintaan-barang/actions.ts) atau
-- location_transfers (dipakai aktif oleh Llauk buat BSJ). Alurnya:
--   1. Kitchen/Bar ajukan warehouse_requests (+ items) ke satu Gudang.
--   2. Gudang milah-milah: bikin warehouse_delivery_notes (Surat Jalan) --
--      RPC create_warehouse_delivery_note, atomik: stok warehouse_items
--      berkurang di titik ini (barang fisik keluar dari Gudang).
--   3. Kitchen/Bar cek Surat Jalan masuk, per item PILIH SENDIRI bahan
--      master + qty yang mau ditambahkan ke ingredient_location_stock
--      mereka (actions.ts, bukan RPC ini) -- SENGAJA TIDAK OTOMATIS, karena
--      nama/satuan barang Gudang belum tentu sama persis dengan ingredient
--      Kitchen/Bar (arahan user 2026-09-11: "pilih nambah stock nya
--      berapa" -- staf yang putuskan, bukan sistem).
create table public.warehouse_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  request_number text not null,
  from_location_id uuid not null references public.stock_locations (id) on delete cascade,
  to_location_id uuid not null references public.stock_locations (id) on delete cascade,
  requested_by_name text not null,
  note text,
  created_at timestamptz not null default now()
);

create index warehouse_requests_business_id_idx on public.warehouse_requests (business_id);
create index warehouse_requests_from_location_id_idx on public.warehouse_requests (from_location_id);
create index warehouse_requests_to_location_id_idx on public.warehouse_requests (to_location_id);

alter table public.warehouse_requests enable row level security;
create policy "Owner manages warehouse requests of own businesses"
on public.warehouse_requests for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

create table public.warehouse_request_items (
  id uuid primary key default gen_random_uuid(),
  warehouse_request_id uuid not null references public.warehouse_requests (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  item_name text not null,
  unit text,
  qty_requested numeric(12, 2) not null,
  qty_sent numeric(12, 2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create index warehouse_request_items_request_id_idx on public.warehouse_request_items (warehouse_request_id);

alter table public.warehouse_request_items enable row level security;
create policy "Owner manages warehouse request items of own businesses"
on public.warehouse_request_items for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

create table public.warehouse_delivery_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  dn_number text not null,
  warehouse_request_id uuid references public.warehouse_requests (id) on delete set null,
  from_location_id uuid not null references public.stock_locations (id) on delete cascade,
  to_location_id uuid not null references public.stock_locations (id) on delete cascade,
  prepared_by text not null,
  note text,
  created_at timestamptz not null default now()
);

create index warehouse_delivery_notes_business_id_idx on public.warehouse_delivery_notes (business_id);
create index warehouse_delivery_notes_to_location_id_idx on public.warehouse_delivery_notes (to_location_id);

alter table public.warehouse_delivery_notes enable row level security;
create policy "Owner manages warehouse delivery notes of own businesses"
on public.warehouse_delivery_notes for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

create table public.warehouse_delivery_note_items (
  id uuid primary key default gen_random_uuid(),
  delivery_note_id uuid not null references public.warehouse_delivery_notes (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  warehouse_item_id uuid references public.warehouse_items (id) on delete set null,
  item_name text not null,
  unit text,
  qty numeric(12, 2) not null,
  received_ingredient_id uuid references public.ingredients (id) on delete set null,
  received_qty numeric(12, 2),
  received_at timestamptz,
  received_by text,
  created_at timestamptz not null default now()
);

create index warehouse_delivery_note_items_dn_id_idx on public.warehouse_delivery_note_items (delivery_note_id);

alter table public.warehouse_delivery_note_items enable row level security;
create policy "Owner manages warehouse delivery note items of own businesses"
on public.warehouse_delivery_note_items for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Satu langkah atomik (pola sama transfer_ingredient_stock): cek stok
-- cukup, kurangi warehouse_items.stock, catat stock_adjustments, insert
-- Surat Jalan + item-nya, dan (kalau berasal dari sebuah permintaan) tambah
-- qty_sent di warehouse_request_items terkait -- semua dalam 1 transaksi
-- supaya tidak ada state "stok sudah kepotong tapi surat jalan gagal".
create or replace function public.create_warehouse_delivery_note(
  p_business_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_prepared_by text,
  p_items jsonb,
  p_warehouse_request_id uuid default null,
  p_note text default null
)
returns table (delivery_note_id uuid, dn_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dn_id uuid;
  v_dn_number text;
  v_seq int;
  v_item jsonb;
  v_warehouse_item_id uuid;
  v_request_item_id uuid;
  v_item_name text;
  v_unit text;
  v_qty numeric;
  v_stock_before numeric;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Pilih minimal satu barang untuk Surat Jalan.';
  end if;

  select count(*) + 1 into v_seq
  from public.warehouse_delivery_notes
  where business_id = p_business_id
    and created_at::date = current_date;
  v_dn_number := 'SJ-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.warehouse_delivery_notes (
    business_id, dn_number, warehouse_request_id, from_location_id, to_location_id, prepared_by, note
  ) values (
    p_business_id, v_dn_number, p_warehouse_request_id, p_from_location_id, p_to_location_id, p_prepared_by, p_note
  ) returning id into v_dn_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_warehouse_item_id := (v_item->>'warehouse_item_id')::uuid;
    v_request_item_id := nullif(v_item->>'request_item_id', '')::uuid;
    v_qty := (v_item->>'qty')::numeric;

    if v_qty is null or v_qty <= 0 then
      raise exception 'Qty harus lebih dari 0.';
    end if;

    select name, unit, stock into v_item_name, v_unit, v_stock_before
    from public.warehouse_items
    where id = v_warehouse_item_id and business_id = p_business_id
    for update;

    if v_item_name is null then
      raise exception 'Barang Gudang tidak ditemukan.';
    end if;
    if v_stock_before < v_qty - 1e-9 then
      raise exception 'Stok % tidak cukup (tersedia %, diminta %).', v_item_name, v_stock_before, v_qty;
    end if;

    update public.warehouse_items
    set stock = v_stock_before - v_qty, updated_at = now()
    where id = v_warehouse_item_id;

    insert into public.warehouse_delivery_note_items (
      delivery_note_id, business_id, warehouse_item_id, item_name, unit, qty
    ) values (
      v_dn_id, p_business_id, v_warehouse_item_id, v_item_name, v_unit, v_qty
    );

    insert into public.stock_adjustments (
      business_id, warehouse_item_id, location_id, item_name, unit,
      stock_before, stock_after, diff, reason
    ) values (
      p_business_id, v_warehouse_item_id, p_from_location_id, v_item_name, v_unit,
      v_stock_before, v_stock_before - v_qty, -v_qty, 'Dikirim via Surat Jalan ' || v_dn_number
    );

    if v_request_item_id is not null then
      update public.warehouse_request_items
      set qty_sent = qty_sent + v_qty
      where id = v_request_item_id and business_id = p_business_id;
    end if;
  end loop;

  return query select v_dn_id, v_dn_number;
end;
$$;

grant execute on function public.create_warehouse_delivery_note(uuid, uuid, uuid, text, jsonb, uuid, text) to authenticated;
