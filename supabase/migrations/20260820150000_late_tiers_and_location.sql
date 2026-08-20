-- 1. Tingkatan potongan keterlambatan custom (misal >5 menit = Rp10rb,
-- >30 menit = Rp25rb, >60 menit = Rp50rb). Kalau bisnis punya baris di
-- sini, ini yang dipakai (bukan late_deduction_per_occurrence flat) —
-- dicek di kode saat hitung slip: cari tier dengan threshold_minutes
-- terbesar yang masih < late_minutes hari itu. Kalau tabel ini kosong,
-- tetap fallback ke late_deduction_per_occurrence lama biar bisnis yang
-- belum sempat atur tingkatan tidak kehilangan potongan sama sekali.
create table public.late_deduction_tiers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  threshold_minutes int not null check (threshold_minutes >= 0),
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (business_id, threshold_minutes)
);

create index late_deduction_tiers_business_id_idx on public.late_deduction_tiers (business_id);

alter table public.late_deduction_tiers enable row level security;

create policy "Owner manages late deduction tiers of own businesses"
on public.late_deduction_tiers for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- 2. Lokasi GPS saat absen selfie — biar tidak bisa absen sembarangan
-- (admin bisa cek di Google Maps posisi HP staf waktu absen). Nullable
-- karena browser/HP staf bisa saja menolak izin lokasi — absen tetap
-- diterima, cuma lokasinya kosong.
alter table public.attendance
  add column check_in_lat numeric(9, 6),
  add column check_in_lng numeric(9, 6),
  add column check_out_lat numeric(9, 6),
  add column check_out_lng numeric(9, 6);
