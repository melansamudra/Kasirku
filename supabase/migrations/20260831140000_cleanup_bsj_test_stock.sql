-- Hapus data stok BSJ hasil testing fitur Portal Lokasi (Aug 28-29), bukan
-- produksi riil -- riwayatnya jelas ("Test Portal Staff", "Anwar", beruntun
-- dalam hitungan detik, ada yang sampai minus). Belum pernah ada produksi
-- BSJ yang benar-benar disetujui di sistem ini (lihat production_runs, cuma
-- 2 baris & keduanya status 'rejected'). Direset ke 0 (baris dihapus, bukan
-- di-set 0, karena tidak adanya baris di semi_finished_item_location_stock
-- sudah berarti stok 0 di aplikasi).
delete from public.stock_adjustments
where business_id = 'f7c0509b-d708-45d5-9245-592e50f7cbbe'
  and semi_finished_item_id in (
    'a08a6293-8f87-43e1-a88d-4f4874a366b7', -- Air Rebusan Iga
    '3914197c-fa15-4f1c-ba3e-a7518b946db9', -- Ayam Paha Pentung
    'ad1cd6b9-c4b2-47cf-8dda-4631676fddce', -- Babat Madura
    '17b34305-ae35-4621-82af-f1005e4df30d', -- Bumbu Aceh
    '692f99a7-d10d-4af0-9813-22cf8832f0f4'  -- Iga Bakar
  );

delete from public.semi_finished_item_location_stock
where business_id = 'f7c0509b-d708-45d5-9245-592e50f7cbbe'
  and semi_finished_item_id in (
    'a08a6293-8f87-43e1-a88d-4f4874a366b7',
    '3914197c-fa15-4f1c-ba3e-a7518b946db9',
    'ad1cd6b9-c4b2-47cf-8dda-4631676fddce',
    '17b34305-ae35-4621-82af-f1005e4df30d',
    '692f99a7-d10d-4af0-9813-22cf8832f0f4'
  );
