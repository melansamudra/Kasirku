-- Rate lembur per jam: ada default di level bisnis (berlaku ke semua
-- karyawan), tapi bisa di-override per karyawan kalau rate-nya beda
-- (mis. karyawan senior lembur lebih mahal). null di employees berarti
-- "pakai rate default toko".
alter table public.businesses add column lembur_rate_per_hour numeric(12, 2) not null default 0;
alter table public.employees add column lembur_rate_per_hour numeric(12, 2);

-- Payslip: snapshot jam & rate yang dipakai waktu slip dibuat (dari Rekap
-- Payroll) — supaya slip lama tetap bisa dijelaskan kalaupun rate berubah
-- belakangan. lembur_amount tetap bisa diedit manual lewat form Lembur &
-- THR yang sudah ada di halaman slip; dua kolom ini murni buat audit/
-- tampilan breakdown, bukan sumber kebenaran nominalnya.
alter table public.payslips
  add column lembur_hours numeric(10, 2) not null default 0,
  add column lembur_rate numeric(12, 2) not null default 0;
