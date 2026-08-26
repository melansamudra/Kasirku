-- Mengikuti metodologi costing yang sudah dipakai Lauk Nusantara di Excel:
-- setiap resep punya buffer "Fluctuation" (susut/fluktuasi harga bahan, mis.
-- 15%/25%/3%) yang ditambahkan di atas jumlah bahan mentah sebelum jadi HPP
-- final. Tanpa ini, HPP di aplikasi akan selalu lebih rendah dari angka yang
-- sudah mereka percaya. Berlaku untuk bahan setengah jadi & produk jadi
-- (produk jadi juga sempat dipakai buffer sendiri di kartu resepnya).
--
-- target_food_cost_pct dipakai KHUSUS produk jadi, untuk mode "harga jual
-- otomatis" (selling price = HPP / target food cost %) — pendamping
-- selling_price manual yang sudah ada, bukan pengganti.

alter table public.semi_finished_items
  add column fluctuation_pct numeric(5, 2) not null default 0
    check (fluctuation_pct >= 0 and fluctuation_pct < 100);

alter table public.finished_products
  add column fluctuation_pct numeric(5, 2) not null default 0
    check (fluctuation_pct >= 0 and fluctuation_pct < 100),
  add column target_food_cost_pct numeric(5, 2)
    check (target_food_cost_pct is null or (target_food_cost_pct > 0 and target_food_cost_pct <= 100));
