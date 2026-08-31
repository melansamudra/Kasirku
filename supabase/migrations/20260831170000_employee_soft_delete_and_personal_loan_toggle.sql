-- 1) Soft-delete karyawan (beda dengan "active" -- nonaktif tetap kelihatan
-- di halaman Karyawan buat riwayat, sedangkan dihapus benar-benar hilang
-- dari daftar & semua dropdown pemilihan nama). Baris tidak pernah dihapus
-- fisik supaya riwayat lama (absensi/payroll/produksi) tetap utuh -- sama
-- pola dengan ingredients.deleted_at.
alter table public.employees
  add column deleted_at timestamptz;

-- 2) Toggle per-bisnis buat sembunyikan fitur "Pinjaman Pribadi" di halaman
-- Karyawan -- default aktif (perilaku lama semua bisnis lain tidak
-- berubah), dimatikan khusus Llauk Nusantara atas permintaan user 2026-08-31.
alter table public.businesses
  add column personal_loan_enabled boolean not null default true;

update public.businesses
set personal_loan_enabled = false
where id = 'f7c0509b-d708-45d5-9245-592e50f7cbbe';
