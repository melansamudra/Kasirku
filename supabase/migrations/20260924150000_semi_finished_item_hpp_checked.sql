-- Checkbox "HPP sudah diperiksa" per bahan setengah jadi -- sama pola dengan
-- products.hpp_checked (20260909110000), dipakai user buat nandain progres
-- pas hitung ulang resep 80 BSJ yang baru dicopy ke Dapur Produksi. Murni
-- penanda visual, tidak mempengaruhi perhitungan HPP.
alter table public.semi_finished_items
add column if not exists hpp_checked boolean not null default false;
