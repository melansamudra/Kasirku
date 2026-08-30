-- Nominal Tunjangan Tetap sekarang boleh 0 (belum diisi) -- dipakai buat
-- daftarin nama tunjangan dulu buat semua karyawan sekaligus, nominalnya
-- diisi belakangan per-karyawan. Template dengan nominal 0 dilewati saat
-- bikin slip gaji (lihat createPayslip di payroll/actions.ts), tidak ikut
-- nongol jadi baris "Rp0" yang aneh.
alter table public.employee_recurring_allowances
  drop constraint employee_recurring_allowances_amount_check,
  add constraint employee_recurring_allowances_amount_check check (amount >= 0);
