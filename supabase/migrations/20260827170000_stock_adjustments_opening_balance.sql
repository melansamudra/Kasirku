-- Stok Awal (opening balance): sebelumnya stock_adjustments cuma bisa
-- menyasar products/ingredients, dan selalu tercatat "hari ini" (created_at
-- default now(), tidak ada kolom tanggal efektif terpisah). Supaya stok
-- awal bulan bisa dicatat berlaku SEJAK tanggal tertentu (mis. 1 Agustus)
-- alih-alih numpuk di tanggal input, dan supaya Bahan Setengah Jadi juga
-- bisa disesuaikan (bukan cuma ingredients/products) --
--   1. entry_date: tanggal EFEKTIF penyesuaian (dipakai laporan), terpisah
--      dari created_at (audit kapan barisnya benar-benar diinput).
--   2. semi_finished_item_id: target ketiga selain product_id/ingredient_id.
-- Penyesuaian stok sendiri TIDAK otomatis membuat jurnal (sama seperti
-- sebelumnya) -- kalau perlu berdampak ke Buku Besar/Laporan Harian, posting
-- manual lewat public.post_journal_entry yang sudah ada (accept p_date bebas).
alter table public.stock_adjustments
  add column entry_date date not null default (now()::date),
  add column semi_finished_item_id uuid references public.semi_finished_items (id) on delete set null;

create index stock_adjustments_semi_finished_item_id_idx
  on public.stock_adjustments (semi_finished_item_id);

alter table public.stock_adjustments drop constraint stock_adjustments_target_chk;
alter table public.stock_adjustments add constraint stock_adjustments_target_chk check (
  (product_id is not null and ingredient_id is null and semi_finished_item_id is null)
  or (product_id is null and ingredient_id is not null and semi_finished_item_id is null)
  or (product_id is null and ingredient_id is null and semi_finished_item_id is not null)
);
