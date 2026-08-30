-- Kalender tanggal merah/libur tambahan buat payroll -- tanggal ini ikut
-- kena potongan "izin weekend" (denda tambahan), sama kayak Sabtu/Minggu
-- biasa. Dipicu kebutuhan Adi's Culinary Pleburan (weekend Jumat-Sabtu,
-- tapi tanggal merah nasional lain tetap harus kena potongan penuh), dibuat
-- generic per bisnis biar bisnis lain bisa pakai juga kalau perlu. Kosong
-- (default) = tidak ada efek tambahan, perilaku lama tetap sama.
create table public.payroll_holidays (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  holiday_date date not null,
  label text,
  created_at timestamptz not null default now(),
  unique (business_id, holiday_date)
);

create index payroll_holidays_business_id_idx on public.payroll_holidays (business_id);

alter table public.payroll_holidays enable row level security;

create policy "Owner manages payroll holidays of own businesses"
on public.payroll_holidays for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
