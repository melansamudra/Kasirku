-- Rename lokasi "Kitchen Atas" jadi "Kitchen Llauk" (arahan user 2026-08-28).
-- Sidebar/judul halaman semua baca location.name langsung dari tabel ini,
-- jadi cukup update datanya -- tidak ada kode yang perlu diubah.
update public.stock_locations
set name = 'Kitchen Llauk'
where business_id = 'f7c0509b-d708-45d5-9245-592e50f7cbbe'
  and name = 'Kitchen Atas';
