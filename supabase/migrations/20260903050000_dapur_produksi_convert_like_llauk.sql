-- Konversi "Dapur Produksi" (business_id 0556bacc-4915-401e-9d1c-2bf8d6383afb)
-- dari mode cost-control penuh ke mode "rich_stock_ops" standar -- persis
-- pola yang dipakai untuk Llauk Nusantara (lihat
-- 20260902040000_rich_stock_ops_flag_and_llauk_convert.sql +
-- 20260902050000_llauk_default_sidebar_like_adis.sql). Arahan user
-- 2026-09-03: tema/sidebar Dapur Produksi disamakan persis seperti Llauk
-- sekarang (standar/biru, bukan cost-control/amber), meski konsekuensinya
-- halaman "Kelola Produk" berubah dari versi khusus BSJ-jadi-produk
-- (semi_finished_item_id, lihat 20260901100000_products_semi_finished_link.sql)
-- jadi versi standar (product_recipes + ingredients biasa) -- sudah
-- dikonfirmasi & diterima user.
--
-- Tidak perlu migrasi data (finished_products->products,
-- semi_finished_items->ingredients dst) -- Dapur Produksi 0 baris di
-- `products`/`finished_products`/`purchases`/`transactions`, jadi tidak ada
-- yang perlu dibersihkan seperti migration Llauk #3. Kode
-- addSemiFinishedItem (semi-finished-items/actions.ts) sudah otomatis
-- mengecualikan bisnis rich_stock_ops_enabled dari pembuatan kembaran
-- ingredient (pelajaran dari migration #4/#5 Llauk), jadi tidak perlu
-- diulang di sini.
update public.businesses
set cost_control_enabled = false,
    rich_stock_ops_enabled = true,
    hidden_nav_keys = array['pos'],
    stock_deduction_enabled = false,
    stock_locations_enabled = true
where id = '0556bacc-4915-401e-9d1c-2bf8d6383afb';
