-- Rincian gaji dipecah jadi 3 komponen (per permintaan Adi's Pleburan, tapi
-- dibuat generic per-karyawan -- kosong/0 = tidak berubah dari skema lama):
-- 1. Gaji Pokok (sudah ada, dari daily_rate/monthly_rate, prorata seperti biasa)
-- 2. Uang Makan Harian -- nominal tetap x jumlah hari HADIR (bukan izin,
--    karena uang makan cuma berlaku kalau fisik masuk kerja)
-- 3. Tunjangan Kehadiran Harian -- nominal tetap x jumlah hari HADIR, sama
--    alasannya kayak uang makan
-- Dua kolom ini opsional per-karyawan -- default 0 supaya karyawan yang
-- belum diisi tidak berubah gajinya sama sekali.
alter table public.employees
  add column daily_meal_allowance numeric(12, 2) not null default 0,
  add column daily_attendance_allowance numeric(12, 2) not null default 0;

-- Snapshot di payslips (sama pola kayak base_pay/izin_deduction) -- supaya
-- slip yang sudah dibuat tidak berubah nominalnya kalau nanti nominal
-- uang makan/kehadiran karyawan itu diubah lagi.
alter table public.payslips
  add column meal_allowance numeric(12, 2) not null default 0,
  add column attendance_allowance numeric(12, 2) not null default 0;
