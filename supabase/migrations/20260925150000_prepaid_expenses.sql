-- Biaya Dibayar Dimuka: pola sama persis dengan Aset Tetap/Penyusutan
-- (20260710150000) -- bayar sekali di muka (mis. langganan POS 1 tahun,
-- sewa, asuransi), lalu dicicil jadi beban tiap bulan lewat tombol posting,
-- bukan langsung jadi beban penuh saat dibayar. Bedanya dari Aset Tetap:
-- tiap baris bisa dicicil ke akun BEBAN yang beda-beda (mis. langganan POS
-- ke akun tersendiri, sewa ke Beban Sewa) -- Aset Tetap semuanya nge-pool
-- ke satu akun "Beban Penyusutan" karena memang cuma satu jenis (fisik).
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
    (p_business_id, '1-501', 'Akumulasi Penyusutan', 'aset', 'debit', true),
    (p_business_id, '1-502', 'Biaya Dibayar Dimuka', 'aset', 'debit', true),
    (p_business_id, '2-001', 'Utang Dagang', 'kewajiban', 'kredit', true),
    (p_business_id, '2-100', 'Utang Gaji', 'kewajiban', 'kredit', true),
    (p_business_id, '2-200', 'PPN Keluaran (Utang Pajak)', 'kewajiban', 'kredit', true),
    (p_business_id, '3-001', 'Modal Pemilik', 'modal', 'kredit', true),
    (p_business_id, '3-100', 'Laba Ditahan', 'modal', 'kredit', true),
    (p_business_id, '4-001', 'Pendapatan Penjualan', 'pendapatan', 'kredit', true),
    (p_business_id, '5-001', 'Beban Pokok Penjualan (HPP)', 'beban', 'debit', true),
    (p_business_id, '5-100', 'Beban Gaji', 'beban', 'debit', true),
    (p_business_id, '5-101', 'Beban Listrik & Air', 'beban', 'debit', true),
    (p_business_id, '5-102', 'Beban Sewa', 'beban', 'debit', true),
    (p_business_id, '5-103', 'Beban Marketing', 'beban', 'debit', true),
    (p_business_id, '5-104', 'Beban Perlengkapan', 'beban', 'debit', true),
    (p_business_id, '5-105', 'Beban Penyusutan', 'beban', 'debit', true),
    (p_business_id, '5-999', 'Beban Lain-lain', 'beban', 'debit', true)
  on conflict (business_id, code) do nothing;
end;
$$;

-- Backfill akun baru buat business yang sudah ada (sama pola dengan migration
-- Aset Tetap) -- cukup panggil ulang seed, on conflict do nothing menjaga
-- baris yang sudah ada (termasuk yang sudah di-custom nama/dihapus manual).
do $$
declare
  b record;
begin
  for b in select id from public.businesses loop
    perform private.seed_default_accounts(b.id);
  end loop;
end;
$$;

create table public.prepaid_expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  payment_date date not null,
  total_amount numeric(14, 2) not null check (total_amount > 0),
  amortization_months int not null check (amortization_months > 0),
  expense_account_code text not null,
  amortized_amount numeric(14, 2) not null default 0,
  disposed_at timestamptz,
  created_at timestamptz not null default now()
);

create index prepaid_expenses_business_id_idx on public.prepaid_expenses (business_id);

alter table public.prepaid_expenses enable row level security;

create policy "Owner manages prepaid expenses of own businesses"
on public.prepaid_expenses for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Satu baris per business per bulan kalender yang sudah diposting, sama
-- pola dengan depreciation_postings -- mencegah bulan yang sama diposting dua kali.
create table public.prepaid_expense_postings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  period date not null,
  total_amount numeric(14, 2) not null,
  journal_entry_id uuid references public.journal_entries (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, period)
);

create index prepaid_expense_postings_business_id_idx on public.prepaid_expense_postings (business_id, period desc);

alter table public.prepaid_expense_postings enable row level security;

create policy "Owner views prepaid expense postings of own businesses"
on public.prepaid_expense_postings for select
using (private.owns_business(business_id));
