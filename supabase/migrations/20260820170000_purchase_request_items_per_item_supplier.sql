-- Revisi Permintaan Barang: supplier & qty yang disetujui ternyata perlu
-- per BARANG, bukan per order — satu order bisa berisi barang yang harus
-- dibeli dari supplier berbeda-beda, dan admin perlu bisa mengoreksi qty
-- yang disetujui (beda dari qty yang diminta staf) sebelum diteruskan.

alter table public.purchase_request_items
  add column supplier_id uuid references public.suppliers (id) on delete set null,
  add column approved_qty numeric(12, 2) check (approved_qty is null or approved_qty >= 0),
  add column forwarded_at timestamptz;

-- supplier_id di header purchase_requests sudah digantikan sepenuhnya oleh
-- kolom di atas (per-item) — belum ada data produksi yang bergantung pada
-- kolom ini (fitur baru rilis, baru dipakai buat testing).
alter table public.purchase_requests drop column supplier_id;
