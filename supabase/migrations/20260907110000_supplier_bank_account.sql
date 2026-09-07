-- Info rekening bank supplier -- ditampilkan di dokumen Pengajuan Pembayaran
-- Hutang biar Owner tahu ke rekening mana harus transfer saat approve
-- (arahan user 2026-09-07).
alter table public.suppliers
  add column bank_name text,
  add column bank_account_number text,
  add column bank_account_holder text;
