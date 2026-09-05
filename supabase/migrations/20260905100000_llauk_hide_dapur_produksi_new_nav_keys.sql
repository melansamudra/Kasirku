-- Commit 3597873 (4 Sep) & 91ec3b6 (4 Sep) menambah item nav baru
-- ("Bahan Setengah Jadi" per lokasi, "Produksi") ke buildSimpleLocationNavGroups
-- di dashboard-shell.tsx. Key barunya belum ada di hidden_nav_keys Llauk,
-- jadi grup sidebar "Dapur Produksi" (yang sebelumnya sengaja disembunyikan
-- total lewat 5 key lama) tidak lagi 100% kosong dan muncul lagi utuh --
-- lihat filterGroupsForHiddenKeys: grup cuma di-drop kalau SEMUA itemnya
-- match hidden_nav_keys. Tutup 2 key baru itu supaya grup kembali kosong
-- (tersembunyi total) seperti semula, sampai fitur Produksi/BSJ Dapur
-- Produksi siap dipakai Llauk.
update public.businesses b
set hidden_nav_keys = (
  select array_agg(distinct k) from unnest(
    b.hidden_nav_keys || array[
      'lokasi-' || sl.id::text || '-semi-finished-items',
      'production-runs'
    ]
  ) as k
)
from public.stock_locations sl
where sl.business_id = b.id
  and sl.business_id = 'f7c0509b-d708-45d5-9245-592e50f7cbbe'
  and sl.name = 'Dapur Produksi';
