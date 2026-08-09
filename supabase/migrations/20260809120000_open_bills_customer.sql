-- Tambahkan kolom pelanggan ke open_bills agar bon bisa dikaitkan ke customer
-- saat disimpan, dan customer_id otomatis terpasang ke transaksi saat checkout.
alter table public.open_bills
  add column if not exists customer_name text,
  add column if not exists customer_id uuid references public.customers (id) on delete set null;
