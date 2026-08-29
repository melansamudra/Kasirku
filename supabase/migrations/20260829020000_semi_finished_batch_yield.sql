-- Simpan "batch size" (yieldQty/porsi) resep Bahan Setengah Jadi secara
-- permanen -- sebelumnya cuma variabel client-side dipakai sekali buat bagi
-- qty lalu dibuang (lihat recipe-rows-builder.tsx & saveBsjImport). Tanpa
-- ini, form Tambah Komponen di halaman detail (recipe-editor.tsx) tidak
-- bisa lagi menawarkan input "per batch" yang konsisten dengan create/
-- import, dan sistem juga tidak bisa nampilin balik preview "per batch" ke
-- resep yang sudah tersimpan.
alter table public.semi_finished_items
  add column batch_yield_qty numeric(12, 2);
