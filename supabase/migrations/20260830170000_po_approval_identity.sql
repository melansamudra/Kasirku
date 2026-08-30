-- Approval PO sekarang dikaitkan ke akun login (business_staff/owner), bukan
-- lagi dropdown nama bebas dari tabel `employees`. Kolom teks issued_by /
-- approved_by TETAP dipakai buat tampilan/cetak, kolom *_user_id ini murni
-- buat perbandingan identitas server-side (cegah approve PO sendiri, dan
-- nanti buat enforcement permission "purchase-orders-approve").
alter table public.purchase_orders
  add column issued_by_user_id uuid references auth.users (id) on delete set null,
  add column approved_by_user_id uuid references auth.users (id) on delete set null;
