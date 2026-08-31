-- Reset SEMUA stok bahan baku di lokasi Dapur Produksi ke kosong (bukan cuma
-- Tillapia yang salah hitung jadi Rp478jt) -- lokasi ini belum benar-benar
-- jalan produksinya, jadi lebih aman mulai bersih dari Stock Opname fisik
-- yang baru, daripada nebak-nebak angka mana yang benar dari populasi awal
-- 31 Jul 2026. Lokasi lain (Gudang Utama, Kitchen Llauk, Bar Llauk) TIDAK
-- disentuh -- nilainya sudah wajar.
delete from public.stock_adjustments
where business_id = 'f7c0509b-d708-45d5-9245-592e50f7cbbe'
  and location_id = '75ae92de-4586-469c-b4ce-2aaf06130159'
  and ingredient_id is not null;

delete from public.ingredient_location_stock
where business_id = 'f7c0509b-d708-45d5-9245-592e50f7cbbe'
  and location_id = '75ae92de-4586-469c-b4ce-2aaf06130159';
