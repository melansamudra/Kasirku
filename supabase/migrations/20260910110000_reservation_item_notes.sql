-- Catatan per-item pre-order reservasi (mis. "pedas", "tanpa bawang") --
-- beda dari reservations.note yang levelnya per-reservasi (permintaan
-- umum), ini nempel ke satu baris menu spesifik.
alter table public.reservation_items add column note text;

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
        insert into public.reservation_items (reservation_id, product_id, product_name, qty, note)
        values (
          v_id, v_product.id, v_product.name, coalesce((v_item ->> 'qty')::numeric, 1),
          nullif(trim(coalesce(v_item ->> 'note', '')), '')
        );
      end if;
    end loop;
  end if;

  return v_id;
end;
$$;

select pg_notify('pgrst', 'reload schema');
