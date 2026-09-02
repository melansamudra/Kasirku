-- Sidebar Llauk Nusantara sementara pakai struktur default Kasirku persis
-- seperti Adi's Culinary (Operasional Harian, Data Master & Setup Toko, grup
-- per lokasi simpel, dst) -- bukan lagi struktur cost-control (Ringkasan,
-- Akuntansi, Master & HPP, Dapur Produksi/Purchasing/Operasional). Fitur rich
-- (Produksi, Biaya Operasional, Dokumen Manual, Staf per Lokasi) untuk
-- sementara tidak ada link-nya di sidebar -- datanya aman, akan "dibangun
-- ulang" ke struktur baru sebagai proyek terpisah nanti.
--
-- rich_stock_ops_enabled TETAP true (tidak diubah) -- cuma dipakai buat jaga
-- akses halaman (has-stock-access.ts & gate individual) supaya tidak 404
-- kalau diakses langsung, sudah TIDAK dipakai lagi buat pilih struktur nav.
update public.businesses
set stock_locations_enabled = true
where id = 'f7c0509b-d708-45d5-9245-592e50f7cbbe';
