-- "Cuma update stok" -- untuk kasus kasnya sudah tercatat di tempat lain
-- (mis. sudah disetujui/dibayar lewat Kas Kecil), tapi admin tetap mau
-- stok bahan/produk & unit cost ikut ter-update lewat alur Pembelian yang
-- sudah ada. Kalau kolom ini true, addPurchase() TIDAK memanggil
-- postPurchaseJournal() sama sekali -- supaya kas tidak tercatat dua kali
-- (sekali dari Kas Kecil, sekali lagi dari sini).
alter table public.purchases
  add column stock_only boolean not null default false;
