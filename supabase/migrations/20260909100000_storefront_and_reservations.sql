-- Domain custom per toko + halaman publik (menu + reservasi), lanjutan
-- permintaan "Mie Kota": backoffice/POS tetap Kasirku, tapi toko punya
-- domain sendiri yang sekaligus menampilkan landing publik untuk pelanggan.
--
-- Konvensi keamanan proyek ini (lihat migration
-- 20260823180000_fix_product_options_anon_leak.sql): akses anonim SELALU
-- lewat fungsi security definer yang resolve business_id dari sebuah slug,
-- TIDAK PERNAH lewat RLS policy "to anon" langsung di businesses/products.
-- Semua RPC di bawah mengikuti pola itu persis.

alter table public.businesses
  add column custom_domain text unique,
  add column storefront_enabled boolean not null default false,
  add column storefront_slug text unique,
  add column storefront_tagline text;

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_name text not null,
  phone text not null,
  party_size int not null check (party_size > 0),
  reservation_date date not null,
  reservation_time time not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'selesai')),
  created_at timestamptz not null default now()
);

create index reservations_business_id_date_idx
  on public.reservations (business_id, reservation_date, reservation_time);

alter table public.reservations enable row level security;

create policy "Owner manages reservations of own businesses"
on public.reservations for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- RPC 1: resolve hostname -> business (dipanggil dari proxy di setiap
-- request "/" yang hostname-nya bukan domain platform sendiri).
create or replace function public.get_business_by_custom_domain(p_domain text)
returns table (business_id uuid, storefront_slug text)
language sql
security definer
stable
set search_path = ''
as $$
  select id, storefront_slug from public.businesses
  where lower(custom_domain) = lower(p_domain)
    and storefront_enabled
    and storefront_slug is not null
  limit 1;
$$;

grant execute on function public.get_business_by_custom_domain(text) to anon, authenticated;

-- RPC 2: data halaman publik toko (info + menu produk aktif).
create or replace function public.get_storefront_info(p_slug text)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_business record;
  v_products jsonb;
begin
  select id, name, address, phone, logo_url, storefront_tagline
  into v_business
  from public.businesses
  where storefront_slug = p_slug and storefront_enabled;

  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'price', p.price,
    'category', p.category,
    'image_url', p.image_url
  ) order by p.category, p.name), '[]'::jsonb)
  into v_products
  from public.products p
  where p.business_id = v_business.id and p.deleted_at is null;

  return jsonb_build_object(
    'business', jsonb_build_object(
      'name', v_business.name,
      'address', v_business.address,
      'phone', v_business.phone,
      'logo_url', v_business.logo_url,
      'tagline', v_business.storefront_tagline
    ),
    'products', v_products
  );
end;
$$;

grant execute on function public.get_storefront_info(text) to anon, authenticated;

-- RPC 3: submit reservasi publik.
create or replace function public.create_public_reservation(
  p_storefront_slug text,
  p_customer_name text,
  p_phone text,
  p_party_size int,
  p_reservation_date date,
  p_reservation_time time,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_id uuid;
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

  insert into public.reservations (
    business_id, customer_name, phone, party_size, reservation_date, reservation_time, note
  ) values (
    v_business_id, trim(p_customer_name), trim(p_phone), p_party_size, p_reservation_date, p_reservation_time,
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_public_reservation(text, text, text, int, date, time, text) to anon, authenticated;

-- Admin: tambah storefront_enabled/custom_domain/storefront_slug ke
-- admin_list_businesses supaya superadmin bisa lihat & atur dari /admin
-- (pola sama dengan cost_control_enabled di
-- 20260826180000_admin_list_businesses_cost_control.sql). Harus drop dulu
-- karena perubahan return type.
drop function if exists public.admin_list_businesses();

create function public.admin_list_businesses()
returns table (
  id uuid,
  name text,
  business_type text,
  owner_email text,
  created_at timestamptz,
  shift_open boolean,
  tx_count bigint,
  subscription_status text,
  plan_code text,
  period_end timestamptz,
  mirroring_enabled boolean,
  cost_control_enabled boolean,
  storefront_enabled boolean,
  custom_domain text,
  storefront_slug text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select
    b.id,
    b.name,
    b.business_type,
    u.email::text,
    b.created_at,
    exists (select 1 from public.shifts s where s.business_id = b.id and s.closed_at is null),
    (
      coalesce((select count(*) from public.transactions t where t.business_id = b.id and not t.voided), 0)
      + coalesce((select count(*) from public.ticket_transactions tt where tt.business_id = b.id and not tt.voided), 0)
    ),
    coalesce(sub.status, 'unpaid'),
    nullif(sub.plan_code, ''),
    sub.period_end,
    coalesce(b.mirroring_enabled, false),
    coalesce(b.cost_control_enabled, false),
    coalesce(b.storefront_enabled, false),
    b.custom_domain,
    b.storefront_slug
  from public.businesses b
  join auth.users u on u.id = b.owner_id
  left join public.subscriptions sub on sub.business_id = b.id
  order by b.created_at desc;
end;
$$;

grant execute on function public.admin_list_businesses() to authenticated;

select pg_notify('pgrst', 'reload schema');
