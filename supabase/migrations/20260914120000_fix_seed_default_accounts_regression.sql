-- Migration 20260909140000_payment_method_reconciliation.sql secara tidak
-- sengaja meng-copy versi LAMA seed_default_accounts (sebelum
-- 20260907130000_inter_unit_transfers.sql menambah 1-050/1-060/1-110/1-501/
-- 2-110/2-200/4-002/4-003/4-004/4-999/5-105/5-106/5-107/5-108), lalu cuma
-- nambah 5-109 di atasnya. Hasilnya: bisnis baru yang dibuat sejak
-- 2026-09-09 cuma dapat 17 dari 31 akun standar -- termasuk kehilangan 1-050
-- (Kas Kecil Menunggu Klasifikasi) yang dipakai post_petty_cash_expense,
-- bikin upload Nota Tunai gagal dengan error "account not found: 1-050".
-- Ditemukan lewat laporan bug di bisnis "Mie Kota" (dibuat 2026-09-10).
create or replace function private.seed_default_accounts(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accounts (business_id, code, name, type, normal_balance, is_system)
  values
    (p_business_id, '1-001', 'Kas & Bank', 'aset', 'debit', true),
    (p_business_id, '1-050', 'Kas Kecil Menunggu Klasifikasi', 'aset', 'debit', true),
    (p_business_id, '1-060', 'Piutang Karyawan', 'aset', 'debit', true),
    (p_business_id, '1-100', 'Piutang Usaha', 'aset', 'debit', true),
    (p_business_id, '1-110', 'Piutang Antar-Unit', 'aset', 'debit', true),
    (p_business_id, '1-200', 'Persediaan', 'aset', 'debit', true),
    (p_business_id, '1-500', 'Peralatan', 'aset', 'debit', true),
    (p_business_id, '1-501', 'Akumulasi Penyusutan', 'aset', 'kredit', true),
    (p_business_id, '2-001', 'Utang Dagang', 'kewajiban', 'kredit', true),
    (p_business_id, '2-100', 'Utang Gaji', 'kewajiban', 'kredit', true),
    (p_business_id, '2-110', 'Hutang Antar-Unit', 'kewajiban', 'kredit', true),
    (p_business_id, '2-200', 'PPN Keluaran (Utang Pajak)', 'kewajiban', 'kredit', true),
    (p_business_id, '3-001', 'Modal Pemilik', 'modal', 'kredit', true),
    (p_business_id, '3-100', 'Laba Ditahan', 'modal', 'kredit', true),
    (p_business_id, '4-001', 'Pendapatan Penjualan', 'pendapatan', 'kredit', true),
    (p_business_id, '4-002', 'Pendapatan Tiket', 'pendapatan', 'kredit', true),
    (p_business_id, '4-003', 'Pendapatan Gofood', 'pendapatan', 'kredit', true),
    (p_business_id, '4-004', 'Pendapatan Grabfood', 'pendapatan', 'kredit', true),
    (p_business_id, '4-999', 'Pendapatan Lain-lain', 'pendapatan', 'kredit', true),
    (p_business_id, '5-001', 'Beban Pokok Penjualan (HPP)', 'beban', 'debit', true),
    (p_business_id, '5-100', 'Beban Gaji', 'beban', 'debit', true),
    (p_business_id, '5-101', 'Beban Listrik & Air', 'beban', 'debit', true),
    (p_business_id, '5-102', 'Beban Sewa', 'beban', 'debit', true),
    (p_business_id, '5-103', 'Beban Marketing', 'beban', 'debit', true),
    (p_business_id, '5-104', 'Beban Perlengkapan', 'beban', 'debit', true),
    (p_business_id, '5-105', 'Beban Penyusutan', 'beban', 'debit', true),
    (p_business_id, '5-106', 'Beban Gas LPG', 'beban', 'debit', true),
    (p_business_id, '5-107', 'Beban Konsumsi', 'beban', 'debit', true),
    (p_business_id, '5-108', 'Beban Komisi Ojol', 'beban', 'debit', true),
    (p_business_id, '5-109', 'Beban Admin Bank/EDC', 'beban', 'debit', true),
    (p_business_id, '5-999', 'Beban Lain-lain', 'beban', 'debit', true)
  on conflict (business_id, code) do nothing;
end;
$$;

-- Backfill: tambal akun yang hilang di bisnis yang sudah terlanjur dibuat
-- selama regresi ini aktif (2026-09-09 s/d sekarang). Aman dijalankan ulang
-- -- on conflict do nothing, tidak menyentuh akun yang sudah ada/custom.
insert into public.accounts (business_id, code, name, type, normal_balance, is_system)
select b.id, v.code, v.name, v.type, v.normal_balance, true
from public.businesses b
cross join (
  values
    ('1-050', 'Kas Kecil Menunggu Klasifikasi', 'aset', 'debit'),
    ('1-060', 'Piutang Karyawan', 'aset', 'debit'),
    ('1-110', 'Piutang Antar-Unit', 'aset', 'debit'),
    ('1-501', 'Akumulasi Penyusutan', 'aset', 'kredit'),
    ('2-110', 'Hutang Antar-Unit', 'kewajiban', 'kredit'),
    ('2-200', 'PPN Keluaran (Utang Pajak)', 'kewajiban', 'kredit'),
    ('4-002', 'Pendapatan Tiket', 'pendapatan', 'kredit'),
    ('4-003', 'Pendapatan Gofood', 'pendapatan', 'kredit'),
    ('4-004', 'Pendapatan Grabfood', 'pendapatan', 'kredit'),
    ('4-999', 'Pendapatan Lain-lain', 'pendapatan', 'kredit'),
    ('5-105', 'Beban Penyusutan', 'beban', 'debit'),
    ('5-106', 'Beban Gas LPG', 'beban', 'debit'),
    ('5-107', 'Beban Konsumsi', 'beban', 'debit'),
    ('5-108', 'Beban Komisi Ojol', 'beban', 'debit')
) as v(code, name, type, normal_balance)
on conflict (business_id, code) do nothing;
