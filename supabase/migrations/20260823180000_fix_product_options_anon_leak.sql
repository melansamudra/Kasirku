-- Audit keamanan 2026-08-23 nemu: product_option_groups/product_options
-- punya policy "to anon using (true)" TANPA scoping business_id sama
-- sekali -- satu-satunya di seluruh migration yang begini (semua akses
-- anon lain, mis. get_self_order_menu/submit_self_order, lewat RPC
-- security definer yang resolve business_id dari slug, bukan grant tabel
-- langsung). Efeknya: siapapun pegang anon key publik bisa query REST API
-- langsung dan baca modifier/opsi/harga SEMUA bisnis, bukan cuma yang lagi
-- dibuka QR-nya.
--
-- Dicek: get_self_order_menu() TIDAK mengembalikan product options sama
-- sekali (cuma id/name/category/price/emoji/image_url/featured/in_stock),
-- dan tidak ada kode client di src/app/order/ yang query
-- product_option_groups/product_options langsung. Policy anon ini
-- kelihatannya niat awal buat self-order tapi tidak pernah benar-benar
-- dipakai jalur itu -- aman didrop tanpa mematikan fitur apapun.
drop policy if exists "Anon reads option groups" on public.product_option_groups;
drop policy if exists "Anon reads options" on public.product_options;
