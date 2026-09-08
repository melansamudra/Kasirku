-- Stock Opname SEDERHANA untuk bisnis yang bahan bakunya cuma 1 kumpulan
-- global (tidak pakai stock_locations sama sekali) -- pelengkap fitur opname
-- per-lokasi yang sudah ada (stock_opname_entries, wajib location_id NOT
-- NULL, dirancang untuk bisnis multi-lokasi seperti Llauk). Sengaja tabel
-- BARU & terpisah, bukan melonggarkan constraint tabel lama, supaya tidak
-- mengubah perilaku sistem lokasi yang sudah berjalan.
--
-- Filter/pengelompokan pakai `ingredients.departments` (dapur/bar/front)
-- yang SUDAH ADA sebelumnya (dipakai juga oleh Permintaan Barang) -- bukan
-- `ingredient_opname_sections` (itu dirancang untuk kasus multi-lokasi).
--
-- Verifikasi menerapkan KOREKSI (reported - system_stock_at_report) ke
-- ingredients.stock GLOBAL, bukan menimpa mentah -- supaya aman kalau ada
-- penjualan/pembelian lain yang terjadi di antara submit dan verifikasi.
create table public.ingredient_opname_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  entry_date date not null default (now()::date),
  reported_stock numeric(12, 2) not null,
  system_stock_at_report numeric(12, 2) not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  submitted_by_name text,
  note text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index ingredient_opname_entries_business_id_idx
  on public.ingredient_opname_entries (business_id, status, entry_date desc);

alter table public.ingredient_opname_entries enable row level security;

create policy "Owner manages ingredient opname entries of own businesses"
on public.ingredient_opname_entries for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

select pg_notify('pgrst', 'reload schema');
