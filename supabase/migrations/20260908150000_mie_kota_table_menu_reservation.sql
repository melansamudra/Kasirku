-- Perluasan reservasi publik: pilih meja (dengan status terpakai/tidak per
-- tanggal) + pre-order menu sederhana. Skema ini generic & opsional --
-- bisnis lain yang formulir reservasinya tidak mengisi table_id/item tetap
-- jalan seperti biasa (kolom/relasi ini nullable). UI yang memakainya untuk
-- sekarang cuma landing khusus Mie Kota (src/app/toko/[slug]/mie-kota-landing.tsx).

alter table public.reservations
  add column table_id uuid references public.tables (id) on delete set null;

create table public.reservation_items (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  qty numeric(12, 2) not null check (qty > 0)
);

create index reservation_items_reservation_id_idx on public.reservation_items (reservation_id);

alter table public.reservation_items enable row level security;

create policy "Owner manages reservation items of own businesses"
on public.reservation_items for all
using (
  exists (
    select 1 from public.reservations r
    where r.id = reservation_items.reservation_id
      and private.owns_business(r.business_id)
  )
)
with check (
  exists (
    select 1 from public.reservations r
    where r.id = reservation_items.reservation_id
      and private.owns_business(r.business_id)
  )
);

-- RPC: daftar meja + status terpakai/tidak untuk sebuah tanggal (publik,
-- anon). "Terpakai" = ada reservasi lain (bukan cancelled) di meja itu pada
-- tanggal yang sama -- granularitas per HARI, bukan per jam, sesuai
-- permintaan (meja yang sudah kepesan hari itu ditandai merah).
create or replace function public.get_storefront_table_availability(p_slug text, p_date date)
returns table (table_id uuid, table_name text, is_taken boolean)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_business_id uuid;
begin
  select id into v_business_id
  from public.businesses
  where storefront_slug = p_slug and storefront_enabled;

  if v_business_id is null then
    return;
  end if;

  return query
  select
    t.id,
    t.name,
    exists (
      select 1 from public.reservations r
      where r.table_id = t.id
        and r.reservation_date = p_date
        and r.status <> 'cancelled'
    )
  from public.tables t
  where t.business_id = v_business_id
  order by t.name;
end;
$$;

grant execute on function public.get_storefront_table_availability(text, date) to anon, authenticated;

-- create_public_reservation: tambah p_table_id & p_items di akhir parameter
-- (default null) supaya CREATE OR REPLACE tetap kompatibel, tidak perlu
-- drop function. Validasi ulang di server: meja harus milik bisnis yang
-- sama & belum terpakai di tanggal itu (jangan cuma percaya UI client).
create or replace function public.create_public_reservation(
  p_storefront_slug text,
  p_customer_name text,
  p_phone text,
  p_party_size int,
  p_reservation_date date,
  p_reservation_time time,
  p_note text default null,
  p_table_id uuid default null,
  p_items jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_id uuid;
  v_item jsonb;
  v_product record;
begin
  select id into v_business_id
  from public.businesses
  where storefront_slug = p_storefront_slug and storefront_enabled;

  if v_business_id is null then
    raise exception 'toko tidak ditemukan';
  end if;
  if p_customer_name is null or length(trim(p_customer_name)) = 0 then
    raise exception 'nama wajib diisi';
  end if;
  if p_phone is null or length(trim(p_phone)) = 0 then
    raise exception 'nomor telepon wajib diisi';
  end if;
  if p_party_size is null or p_party_size <= 0 then
    raise exception 'jumlah tamu tidak valid';
  end if;

  if p_table_id is not null then
    if not exists (
      select 1 from public.tables where id = p_table_id and business_id = v_business_id
    ) then
      raise exception 'meja tidak ditemukan';
    end if;
    if exists (
      select 1 from public.reservations
      where table_id = p_table_id
        and reservation_date = p_reservation_date
        and status <> 'cancelled'
    ) then
      raise exception 'meja ini sudah dipesan untuk tanggal tersebut, silakan pilih meja lain';
    end if;
  end if;

  insert into public.reservations (
    business_id, customer_name, phone, party_size, reservation_date, reservation_time, note, table_id
  ) values (
    v_business_id, trim(p_customer_name), trim(p_phone), p_party_size, p_reservation_date, p_reservation_time,
    nullif(trim(coalesce(p_note, '')), ''), p_table_id
  )
  returning id into v_id;

  if p_items is not null then
    for v_item in select * from jsonb_array_elements(p_items) loop
      select id, name into v_product
      from public.products
      where id = (v_item ->> 'product_id')::uuid and business_id = v_business_id and deleted_at is null;

      if v_product.id is not null then
        insert into public.reservation_items (reservation_id, product_id, product_name, qty)
        values (v_id, v_product.id, v_product.name, coalesce((v_item ->> 'qty')::numeric, 1));
      end if;
    end loop;
  end if;

  return v_id;
end;
$$;

grant execute on function public.create_public_reservation(text, text, text, int, date, time, text, uuid, jsonb) to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
