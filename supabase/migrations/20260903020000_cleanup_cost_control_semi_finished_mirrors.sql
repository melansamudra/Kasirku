-- Migration 20260903010000 sempat backfill kembaran ingredient untuk SEMUA
-- BSJ tanpa syarat, termasuk 124 milik bisnis cost-control (Dapur Produksi &
-- Llauk Nusantara) yang sama sekali tidak butuh fitur ini -- mereka sudah
-- punya jalur sendiri (finished_product_recipes) dan tidak checkout lewat
-- POS. Kembaran itu cuma jadi baris kosong (stok 0, unit_cost 0) yang
-- mengotori daftar Bahan Baku mereka. Hapus di sini; kode app
-- (addSemiFinishedItem) sudah diperbaiki supaya tidak bikin kembaran lagi
-- untuk bisnis cost_control_enabled ke depannya.
--
-- FK semi_finished_items.ingredient_id -> ingredients(id) ON DELETE SET NULL
-- jadi cukup hapus baris ingredients-nya, semi_finished_items.ingredient_id
-- otomatis balik null tanpa perlu UPDATE terpisah.
delete from public.ingredients
where id in (
  select ingredient_id
  from public.semi_finished_items
  where business_id in (
    '0556bacc-4915-401e-9d1c-2bf8d6383afb', -- Dapur Produksi
    'f7c0509b-d708-45d5-9245-592e50f7cbbe'  -- Llauk Nusantara
  )
  and ingredient_id is not null
);
