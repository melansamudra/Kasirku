-- Nota Hutang selama ini ikut created_at (kapan diinput) sebagai tanggal
-- transaksi saat diverifikasi jadi Pembelian & jurnal -- kalau nota fisiknya
-- sebenarnya dari bulan lalu tapi baru sempat diinput admin hari ini, beban
-- itu salah nyangkut di bulan berjalan. Tambah kolom `date` (tanggal nota
-- asli, bisa mundur) supaya kasir/admin bisa pilih sendiri, terpisah dari
-- created_at yang tetap mencatat kapan record-nya dibuat di sistem.
alter table public.supplier_debt_notes
  add column date date not null default (now() at time zone 'Asia/Jakarta')::date;

comment on column public.supplier_debt_notes.date is
  'Tanggal nota asli (bisa mundur) -- dipakai sebagai tanggal Pembelian & jurnal saat diverifikasi, beda dari created_at (kapan diinput ke sistem).';
