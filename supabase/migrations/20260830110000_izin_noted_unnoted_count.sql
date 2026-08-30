-- Potongan izin sekarang berbasis ada/tidaknya keterangan (note), bukan lagi
-- weekday/weekend atau nominal manual di Pengaturan Payroll -- berlaku di
-- SEMUA bisnis:
-- - Hadir, Sakit, dan Izin BERKETERANGAN dibayar penuh di Gaji Pokok.
-- - Izin TANPA keterangan kehilangan gaji 1 hari penuh (dihitung otomatis
--   dari rate karyawan), sama seperti Alpa.
-- izin_weekday_count/izin_weekend_count (migration lama) dibiarkan ada buat
-- data historis, tapi slip baru pakai kolom ini sebagai dasar hitung.
alter table public.payslips
  add column izin_noted_count integer not null default 0,
  add column izin_unnoted_count integer not null default 0;
