-- Checkbox "HPP sudah diperiksa" per produk di halaman Kelola Produk --
-- dipakai user buat nandain produk (kitchen/bar dsb) yang HPP-nya sudah
-- dicek manual, murni penanda visual, tidak mempengaruhi perhitungan HPP.
alter table public.products
add column if not exists hpp_checked boolean not null default false;
