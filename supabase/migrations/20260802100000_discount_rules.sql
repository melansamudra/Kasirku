-- Aturan diskon yang bisa dikonfigurasi pemilik di Pengaturan.
-- Dua tipe:
--   per_product : diskon otomatis saat produk tertentu masuk keranjang.
--   promo       : diskon seluruh order (berlaku berdasarkan tanggal &
--                 toggle aktif/nonaktif). Hanya satu promo aktif yang
--                 diterapkan kasir pada satu waktu.
-- Kasir tidak bisa lagi mengisi diskon manual — nilai diskon di-preset
-- di sini dan diterapkan otomatis oleh POS.

create table if not exists public.discount_rules (
  id          uuid    primary key default gen_random_uuid(),
  business_id uuid    not null references public.businesses(id) on delete cascade,
  type        text    not null check (type in ('per_product', 'promo')),
  product_id  uuid    references public.products(id) on delete cascade,
  name        text,
  value       numeric(10,2) not null default 0,
  value_type  text    not null default 'pct' check (value_type in ('pct', 'amt')),
  active      boolean not null default true,
  valid_from  date,
  valid_until date,
  created_at  timestamptz default now(),
  constraint per_product_needs_product check (type = 'promo' or product_id is not null),
  constraint valid_discount_value      check (value >= 0 and (value_type = 'amt' or value <= 100))
);

create index if not exists discount_rules_business_id_idx on public.discount_rules(business_id);

alter table public.discount_rules enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'discount_rules'
      and policyname = 'owners_discount_rules'
  ) then
    create policy "owners_discount_rules"
      on public.discount_rules
      for all
      using (private.owns_business(business_id));
  end if;
end $$;
