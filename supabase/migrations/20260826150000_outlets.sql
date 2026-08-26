-- Outlet/resto tujuan distribusi bahan setengah jadi. Kasirku tidak punya
-- konsep multi-lokasi dalam satu business, dan resto-resto ini TIDAK
-- didaftarkan sebagai business Kasirku terpisah (penjualan resto tidak lewat
-- Kasirku sama sekali) — jadi cukup data internal ringan di dalam business
-- dapur pusat, murni untuk mencatat tujuan distribusi.

create table public.outlets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index outlets_business_id_idx on public.outlets (business_id);

alter table public.outlets enable row level security;

create policy "Owner manages outlets of own businesses"
on public.outlets for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
