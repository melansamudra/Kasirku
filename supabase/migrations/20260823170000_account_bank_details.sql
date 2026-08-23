-- PDO (Permintaan Dana Operasional): slip permintaan transfer perlu
-- nampilin ke rekening mana uangnya harus ditransfer (bank/nomor
-- rekening/atas nama Rekening Operasional) supaya owner langsung tahu
-- tujuan transfer tanpa nanya lagi. Kolom digeneralisasi di `accounts`
-- (bukan tabel khusus PDO) karena secara konsep ini memang detail rekening
-- bank akun tsb -- bisa kepakai lagi kalau nanti ada fitur lain yang butuh
-- info rekening akun manapun.
alter table public.accounts
  add column if not exists bank_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_account_holder text;
