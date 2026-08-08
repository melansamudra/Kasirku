-- Tambah kategori 'Lainnya' untuk pembelian catatan cepat tanpa detail item.
-- Sebelumnya hanya 'Bahan Baku' dan 'Barang Dagang' yang diizinkan.

ALTER TABLE public.purchases
  DROP CONSTRAINT IF EXISTS purchases_category_check;

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_category_check
  CHECK (category IN ('Bahan Baku', 'Barang Dagang', 'Lainnya'));
