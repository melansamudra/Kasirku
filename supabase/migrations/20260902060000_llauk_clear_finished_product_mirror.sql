-- Hapus (soft-delete, sama seperti tombol "Hapus" di Kelola Produk) 144
-- produk hasil sinkron otomatis lama dari "Produk Jadi (HPP)" -- user mau
-- upload ulang produk sendiri dari nol. Sinkronisasi otomatisnya sendiri
-- sudah dimatikan di kode (transactions/new, transactions/actions,
-- transactions/rekap-actions) supaya tidak muncul lagi.
update public.products
set deleted_at = now()
where business_id = 'f7c0509b-d708-45d5-9245-592e50f7cbbe'
  and category = 'Produk Jadi (HPP)'
  and deleted_at is null;
