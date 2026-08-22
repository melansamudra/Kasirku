-- Catatan "petty cash diberikan ke kasir" (mis. Rp2jt/hari) — murni catatan
-- untuk rekonsiliasi manual admin ("koreksi kasir": bandingkan petty cash
-- yang diberikan vs total nota yang sudah dicatat vs uang fisik yang
-- dikembalikan kasir). SENGAJA tidak posting ke jurnal akuntansi apa pun —
-- perpindahan kas fisik dari kas utama ke kasir sudah bisa dicatat lewat
-- "Kas Masuk" biasa (shift_cash_movements/kas-harian) kalau memang mau
-- masuk pembukuan resmi; tabel ini cuma angka pembanding di halaman Kas
-- Kecil, tidak dobel-catat dengan itu.

create table public.petty_cash_allocations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index petty_cash_allocations_business_id_date_idx on public.petty_cash_allocations (business_id, date);

alter table public.petty_cash_allocations enable row level security;

create policy "Owner manages petty cash allocations of own businesses"
on public.petty_cash_allocations for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
