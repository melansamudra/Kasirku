-- Lokasi (mis. Kitchen Llauk, Bar Llauk) diikat ke Bagian tertentu, supaya
-- halaman Bahan Baku lokasi itu otomatis cuma tampilkan bahan yang termasuk
-- bagiannya -- tidak perlu pilih filter manual tiap buka halaman. Keluhan
-- user: Bahan Baku per-lokasi masih nampilin SEMUA 952 bahan baku bisnis,
-- padahal bahan-nya sudah ditandai per bagian (lihat 20260904140000).

create table public.stock_location_opname_sections (
  business_id uuid not null references public.businesses (id) on delete cascade,
  location_id uuid not null references public.stock_locations (id) on delete cascade,
  section_id uuid not null references public.ingredient_opname_sections (id) on delete cascade,
  primary key (location_id, section_id)
);

create index stock_location_opname_sections_section_idx
  on public.stock_location_opname_sections (section_id);

alter table public.stock_location_opname_sections enable row level security;

create policy "Owner manages location opname sections of own businesses"
on public.stock_location_opname_sections for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
