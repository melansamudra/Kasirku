-- Transfer bahan baku antar-lokasi DALAM 1 bisnis (Gudang -> Kitchen/Bar,
-- atau lokasi manapun ke lokasi manapun) -- tabel & RPC BARU, TERPISAH TOTAL
-- dari location_transfers/fulfill_location_transfer_public (yang sudah
-- dipakai AKTIF oleh Llauk buat transfer Bahan Setengah Jadi). Sengaja tidak
-- numpang di situ -- supaya perubahan di sini tidak mungkin menyentuh/
-- merusak alur BSJ yang sudah jalan (arahan user 2026-09-10).
--
-- Desain V1 satu langkah (kirim = terima sekaligus, atomik dalam 1 RPC),
-- sama pola dengan ship_inter_unit_transfer (transfer antar-bisnis) --
-- tidak ada status pending/confirm terpisah dulu.
create table public.ingredient_location_transfers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  from_location_id uuid not null references public.stock_locations (id) on delete cascade,
  to_location_id uuid not null references public.stock_locations (id) on delete cascade,
  transfer_number text not null,
  note text,
  sent_by_name text not null,
  created_at timestamptz not null default now()
);

create unique index ingredient_location_transfers_number_idx
  on public.ingredient_location_transfers (business_id, transfer_number);
create index ingredient_location_transfers_business_id_idx
  on public.ingredient_location_transfers (business_id, created_at desc);

alter table public.ingredient_location_transfers enable row level security;

create policy "Owner manages ingredient location transfers of own businesses"
on public.ingredient_location_transfers for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

create table public.ingredient_location_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.ingredient_location_transfers (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id),
  item_name text not null,
  unit text not null,
  qty numeric(12, 2) not null check (qty > 0)
);

create index ingredient_location_transfer_items_transfer_id_idx
  on public.ingredient_location_transfer_items (transfer_id);

alter table public.ingredient_location_transfer_items enable row level security;

create policy "Owner manages ingredient location transfer items of own businesses"
on public.ingredient_location_transfer_items for all
using (
  exists (
    select 1 from public.ingredient_location_transfers t
    where t.id = transfer_id and private.owns_business(t.business_id)
  )
)
with check (
  exists (
    select 1 from public.ingredient_location_transfers t
    where t.id = transfer_id and private.owns_business(t.business_id)
  )
);

-- RPC utama: pindahkan stok bahan baku dari 1 lokasi ke lokasi lain, DALAM
-- bisnis yang sama, atomik. Beda dari fulfill_location_transfer_public
-- (BSJ) yang cek stoknya SEDANG DIMATIKAN sementara (bug lama, belum
-- dibalikin) -- di sini cek stok cukup WAJIB aktif dari awal, tidak pernah
-- dimatikan.
create or replace function public.transfer_ingredient_stock(
  p_business_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_items jsonb, -- array of {ingredient_id, qty}
  p_sent_by_name text,
  p_note text default null
)
returns table (transfer_id uuid, transfer_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer_id uuid;
  v_transfer_number text;
  v_seq int;
  v_item jsonb;
  v_ingredient_id uuid;
  v_qty numeric(12, 2);
  v_ingredient record;
  v_from_stock_before numeric(12, 2);
  v_from_stock_after numeric(12, 2);
  v_to_stock_before numeric(12, 2);
  v_to_stock_after numeric(12, 2);
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if p_from_location_id = p_to_location_id then
    raise exception 'lokasi asal dan tujuan tidak boleh sama';
  end if;

  if not exists (
    select 1 from public.stock_locations
    where id = p_from_location_id and business_id = p_business_id
  ) then
    raise exception 'invalid sender location';
  end if;
  if not exists (
    select 1 from public.stock_locations
    where id = p_to_location_id and business_id = p_business_id
  ) then
    raise exception 'invalid receiver location';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'no items to transfer';
  end if;
  if p_sent_by_name is null or length(trim(p_sent_by_name)) = 0 then
    raise exception 'sent_by_name required';
  end if;

  select count(*) + 1 into v_seq
  from public.ingredient_location_transfers
  where business_id = p_business_id and created_at::date = current_date;
  v_transfer_number := 'TRF-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.ingredient_location_transfers (
    business_id, from_location_id, to_location_id, transfer_number, note, sent_by_name
  ) values (
    p_business_id, p_from_location_id, p_to_location_id, v_transfer_number,
    nullif(trim(coalesce(p_note, '')), ''), trim(p_sent_by_name)
  ) returning id into v_transfer_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_ingredient_id := (v_item ->> 'ingredient_id')::uuid;
    v_qty := (v_item ->> 'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid qty for item %', v_ingredient_id;
    end if;

    select * into v_ingredient
    from public.ingredients
    where id = v_ingredient_id and business_id = p_business_id and deleted_at is null;
    if not found then
      raise exception 'ingredient not found: %', v_ingredient_id;
    end if;

    select stock into v_from_stock_before
    from public.ingredient_location_stock
    where business_id = p_business_id and location_id = p_from_location_id and ingredient_id = v_ingredient_id;
    v_from_stock_before := coalesce(v_from_stock_before, 0);

    if v_from_stock_before < v_qty then
      raise exception 'stok % tidak cukup di lokasi asal: tersedia %, diminta %', v_ingredient.name, v_from_stock_before, v_qty;
    end if;
    v_from_stock_after := v_from_stock_before - v_qty;

    select stock into v_to_stock_before
    from public.ingredient_location_stock
    where business_id = p_business_id and location_id = p_to_location_id and ingredient_id = v_ingredient_id;
    v_to_stock_before := coalesce(v_to_stock_before, 0);
    v_to_stock_after := v_to_stock_before + v_qty;

    insert into public.ingredient_location_stock (business_id, location_id, ingredient_id, stock, updated_at)
    values (p_business_id, p_from_location_id, v_ingredient_id, v_from_stock_after, now())
    on conflict (location_id, ingredient_id) do update set stock = v_from_stock_after, updated_at = now();

    insert into public.ingredient_location_stock (business_id, location_id, ingredient_id, stock, updated_at)
    values (p_business_id, p_to_location_id, v_ingredient_id, v_to_stock_after, now())
    on conflict (location_id, ingredient_id) do update set stock = v_to_stock_after, updated_at = now();

    insert into public.ingredient_location_transfer_items (transfer_id, ingredient_id, item_name, unit, qty)
    values (v_transfer_id, v_ingredient_id, v_ingredient.name, v_ingredient.unit, v_qty);

    insert into public.stock_adjustments
      (business_id, ingredient_id, location_id, item_name, unit, stock_before, stock_after, diff, reason)
    values
      (p_business_id, v_ingredient_id, p_from_location_id, v_ingredient.name, v_ingredient.unit,
       v_from_stock_before, v_from_stock_after, -v_qty, 'Transfer keluar ' || v_transfer_number),
      (p_business_id, v_ingredient_id, p_to_location_id, v_ingredient.name, v_ingredient.unit,
       v_to_stock_before, v_to_stock_after, v_qty, 'Transfer masuk ' || v_transfer_number);
  end loop;

  return query select v_transfer_id, v_transfer_number;
end;
$$;

grant execute on function public.transfer_ingredient_stock(uuid, uuid, uuid, jsonb, text, text) to authenticated;

select pg_notify('pgrst', 'reload schema');
