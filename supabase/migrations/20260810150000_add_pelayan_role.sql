-- Tambah role 'pelayan' ke tabel cashiers.
-- Pelayan bisa input pesanan (simpan bon) tapi tidak bisa proses pembayaran.
-- Constraint inline tidak punya nama eksplisit — PostgreSQL memberinya nama
-- otomatis 'cashiers_role_check'. Kita drop lalu buat ulang dengan nilai baru.

alter table public.cashiers
  drop constraint if exists cashiers_role_check;

alter table public.cashiers
  add constraint cashiers_role_check
  check (role in ('kasir', 'manajer', 'pelayan'));
