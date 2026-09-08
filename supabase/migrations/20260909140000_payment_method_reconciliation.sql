-- Rekonsiliasi per METODE BAYAR (pelengkap rekonsiliasi per akun yang sudah
-- ada di accounting/rekonsiliasi) -- dipakai khusus buat metode non-tunai
-- (QRIS, Kartu Debit, dst) yang lazim kena potongan biaya admin/MDR merchant
-- sebelum settle ke rekening. Beda dari rekonsiliasi per akun yang cuma
-- mencatat riwayat pasif (tidak mengubah jurnal), di sini selisihnya
-- OTOMATIS diposting jadi beban -- tapi cuma kalau selisihnya POSITIF
-- (nominal sistem > nominal diterima, kasus umum kena potongan). Kalau
-- diterima justru LEBIH BESAR dari sistem, itu kasus tidak biasa (mis. salah
-- input) -- sengaja cuma dicatat riwayat, tidak auto-posting, biar owner
-- cek manual dulu sebelum ada jurnal otomatis yang aneh.

-- 1. Tambah akun beban baru ke chart of accounts default (seed function +
-- backfill semua bisnis yang sudah ada).
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
    (p_business_id, '1-100', 'Piutang Usaha', 'aset', 'debit', true),
    (p_business_id, '1-200', 'Persediaan', 'aset', 'debit', true),
    (p_business_id, '1-500', 'Peralatan', 'aset', 'debit', true),
    (p_business_id, '2-001', 'Utang Dagang', 'kewajiban', 'kredit', true),
    (p_business_id, '2-100', 'Utang Gaji', 'kewajiban', 'kredit', true),
    (p_business_id, '3-001', 'Modal Pemilik', 'modal', 'kredit', true),
    (p_business_id, '3-100', 'Laba Ditahan', 'modal', 'kredit', true),
    (p_business_id, '4-001', 'Pendapatan Penjualan', 'pendapatan', 'kredit', true),
    (p_business_id, '5-001', 'Beban Pokok Penjualan (HPP)', 'beban', 'debit', true),
    (p_business_id, '5-100', 'Beban Gaji', 'beban', 'debit', true),
    (p_business_id, '5-101', 'Beban Listrik & Air', 'beban', 'debit', true),
    (p_business_id, '5-102', 'Beban Sewa', 'beban', 'debit', true),
    (p_business_id, '5-103', 'Beban Marketing', 'beban', 'debit', true),
    (p_business_id, '5-104', 'Beban Perlengkapan', 'beban', 'debit', true),
    (p_business_id, '5-109', 'Beban Admin Bank/EDC', 'beban', 'debit', true),
    (p_business_id, '5-999', 'Beban Lain-lain', 'beban', 'debit', true)
  on conflict (business_id, code) do nothing;
end;
$$;

-- Backfill: bisnis yang sudah ada belum pernah dapat baris 5-109 ini.
insert into public.accounts (business_id, code, name, type, normal_balance, is_system)
select b.id, '5-109', 'Beban Admin Bank/EDC', 'beban', 'debit', true
from public.businesses b
on conflict (business_id, code) do nothing;

-- 2. Tabel riwayat rekonsiliasi per metode bayar.
create table public.payment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  payment_method text not null,
  period_start date not null,
  period_end date not null,
  expected_amount numeric(12, 2) not null,
  received_amount numeric(12, 2) not null,
  difference numeric(12, 2) not null,
  expense_id uuid references public.expenses (id) on delete set null,
  journal_entry_id uuid references public.journal_entries (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index payment_reconciliations_business_id_idx
  on public.payment_reconciliations (business_id, payment_method, period_end desc);

alter table public.payment_reconciliations enable row level security;

create policy "Owner manages payment reconciliations of own businesses"
on public.payment_reconciliations for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

select pg_notify('pgrst', 'reload schema');
