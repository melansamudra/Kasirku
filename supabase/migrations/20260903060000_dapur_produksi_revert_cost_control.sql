-- Revert 20260903050000_dapur_produksi_convert_like_llauk.sql -- user
-- memutuskan tetap pakai tema/mode Cost Control (arahan 2026-09-03,
-- setelah dicoba tema standar seperti Llauk sebentar) supaya halaman
-- "Kelola Produk" khusus (BSJ langsung jadi produk lewat
-- semi_finished_item_id, lihat 20260901100000_products_semi_finished_link.sql)
-- tetap jalan, bukan jatuh ke versi standar.
--
-- Nilai dikembalikan persis seperti sebelum migration konversi
-- (dicatat dari state sebelum 20260903050000 dijalankan):
-- cost_control_enabled=true, rich_stock_ops_enabled=false,
-- stock_deduction_enabled=true, stock_locations_enabled=false,
-- hidden_nav_keys=['transfer','permintaan-barang','purchase-requests',
-- 'purchase-orders','biaya','accounting-anggaran'].
update public.businesses
set cost_control_enabled = true,
    rich_stock_ops_enabled = false,
    stock_deduction_enabled = true,
    stock_locations_enabled = false,
    hidden_nav_keys = array['transfer', 'permintaan-barang', 'purchase-requests', 'purchase-orders', 'biaya', 'accounting-anggaran']
where id = '0556bacc-4915-401e-9d1c-2bf8d6383afb';
