-- Potongan telat linear per menit (mis. Rp1.000/menit) -- alternatif yang
-- jauh lebih simpel daripada Tingkatan Potongan Keterlambatan (yang
-- sebelumnya dipakai orang dengan cara salah: bikin 1 baris tingkatan per
-- menit satu-satu supaya efeknya "linear", jadi puluhan baris panjang).
-- Kalau > 0, ini paling prioritas dipakai di lateDeductionForMinutes
-- (payroll/calc.ts) -- late_deduction_per_occurrence & late_deduction_tiers
-- diabaikan.
alter table public.businesses
  add column late_deduction_per_minute numeric(12, 2) not null default 0;
