-- Tunjangan Transport harian -- field ketiga yang perlakuannya sama persis
-- dengan daily_meal_allowance/daily_attendance_allowance: nominal tetap x
-- jumlah hari HADIR saja (bukan izin), 0 = tidak dipakai. Dipisah dari dua
-- kolom itu (bukan digabung jadi 1 "tunjangan harian" generik) supaya tetap
-- konsisten dengan pola kolom per-jenis yang sudah ada, dan slip gaji bisa
-- menampilkan baris "Transport" terpisah dari "Uang Makan"/"Kehadiran".
alter table public.employees
  add column daily_transport_allowance numeric(12, 2) not null default 0;

alter table public.payslips
  add column transport_allowance numeric(12, 2) not null default 0;
