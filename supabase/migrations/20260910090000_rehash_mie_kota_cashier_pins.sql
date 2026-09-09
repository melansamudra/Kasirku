-- PIN kasir Mie Kota Pusat & Cabang dibuat lewat script data dummy pakai
-- bcryptjs (Node), bukan lewat create_cashier() RPC yang pakai
-- extensions.crypt(...,gen_salt('bf')) milik Postgres sendiri. Hash bcryptjs
-- itu valid secara algoritma (diverifikasi cocok dengan bcryptjs.compareSync),
-- tapi verify_cashier_pin() membandingkannya lewat pgcrypto's crypt(), dan
-- prefix "$2b$" dari bcryptjs berpotensi tidak dikenali sama persis oleh versi
-- pgcrypto yang berjalan -- klasik "PIN salah untuk semua kasir" padahal PIN
-- yang diketik benar. Perbaikannya: hitung ulang hash-nya pakai pgcrypto
-- sendiri (gen_salt('bf')), supaya round-trip create/verify 100% konsisten
-- seperti kasir yang dibuat lewat UI Kelola Kasir biasa. PIN plain-text-nya
-- TIDAK berubah -- 1111 (manajer), 2222 & 3333 (kasir) di kedua toko.
update public.cashiers
set pin_hash = extensions.crypt(v.plain_pin, extensions.gen_salt('bf'))
from (values
  ('0b7b68d7-3817-4f0d-8d14-c2205b3b907d'::uuid, '1111'), -- Mie Kota Pusat - Budi Santoso (manajer)
  ('d08ae18a-0baf-473c-aa2e-0429b8f11607'::uuid, '2222'), -- Mie Kota Pusat - Andi Wijaya (kasir)
  ('a46b9fcf-e240-4307-b1b3-4f9bf3900d1b'::uuid, '3333'), -- Mie Kota Pusat - Dewi Lestari (kasir)
  ('79361e6a-d485-48fe-9edc-e48a07b1c728'::uuid, '1111'), -- Mie Kota Cabang - Siti Aminah (manajer)
  ('ba51fd9b-0801-460a-a811-63fbf9d4c2dc'::uuid, '2222'), -- Mie Kota Cabang - Rina Kartika (kasir)
  ('26265d31-226d-4ea7-8205-94dd9bea1b32'::uuid, '3333')  -- Mie Kota Cabang - Joko Prasetyo (kasir)
) as v(id, plain_pin)
where cashiers.id = v.id;
