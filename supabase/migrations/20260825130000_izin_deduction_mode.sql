-- Sebagian outlet ternyata potongan izinnya bukan nominal tetap, tapi
-- "potong sesuai gaji harian" (weekday) + denda tambahan (weekend). Tambah
-- toggle mode per outlet, default 'flat' (perilaku lama) supaya outlet lain
-- tidak kepengaruh.
alter table public.businesses
  add column if not exists izin_deduction_mode text not null default 'flat'
    check (izin_deduction_mode in ('flat', 'full_day'));
