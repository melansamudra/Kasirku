-- Denda ekstra (terpisah dari potongan gaji harian) buat izin TANPA
-- keterangan yang jatuh di hari weekend toko (weekendDaysForBusiness) atau
-- tanggal merah di Kalender Libur Payroll -- pakai nominal
-- izin_deduction_weekend yang sudah ada di businesses (dulu bagian dari
-- mode flat/full_day, sekarang murni jadi nominal denda ini).
alter table public.payslips
  add column izin_unnoted_weekend_count integer not null default 0,
  add column izin_weekend_penalty numeric(12, 2) not null default 0;
