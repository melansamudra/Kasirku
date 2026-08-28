-- Kategori opsional untuk Bahan Setengah Jadi, sama seperti yang sudah ada
-- di finished_products -- supaya list-nya bisa difilter, tidak scroll
-- panjang pas cari.
alter table public.semi_finished_items
  add column category text;
