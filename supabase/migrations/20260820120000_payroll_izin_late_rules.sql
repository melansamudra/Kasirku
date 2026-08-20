-- 1. Pengaturan payroll berlaku sama untuk semua karyawan di satu bisnis:
-- potongan Izin (beda weekday/weekend) dan potongan per kejadian terlambat.
alter table public.businesses
  add column izin_deduction_weekday numeric(12, 2) not null default 0,
  add column izin_deduction_weekend numeric(12, 2) not null default 0,
  add column late_deduction_per_occurrence numeric(12, 2) not null default 0;

-- 2. Absensi: tandai terlambat, independen dari status (cuma relevan kalau
-- status = hadir — UI yang mengatur, bukan constraint DB, supaya tetap
-- fleksibel kalau suatu saat perlu dicatat manual).
alter table public.attendance add column late boolean not null default false;

-- 3. Payslip: kolom snapshot baru.
-- - izin_weekday_count/izin_weekend_count: pecahan dari izin_count yang
--   sudah ada, dipakai buat hitung potongan izin dengan rate berbeda.
-- - izin_deduction: hasil hitungnya (di-snapshot, bukan tersambung live ke
--   pengaturan supaya slip lama tidak berubah kalau rate diubah belakangan).
-- - late_count/late_deduction: late_deduction kolomnya sudah ada dari
--   migration sebelumnya (tadinya input manual) — sekarang jadi hasil
--   hitung otomatis dari attendance.late x pengaturan, late_count untuk
--   tahu berapa kali.
-- - hari_kerja_efektif: total hari di periode dikurangi hari Off, dipakai
--   buat menurunkan rate harian dari gaji bulanan. Disimpan supaya slip
--   lama tetap bisa dijelaskan kalaupun pola Off berubah belakangan.
alter table public.payslips
  add column izin_weekday_count int not null default 0,
  add column izin_weekend_count int not null default 0,
  add column izin_deduction numeric(12, 2) not null default 0,
  add column late_count int not null default 0,
  add column hari_kerja_efektif int not null default 0;
