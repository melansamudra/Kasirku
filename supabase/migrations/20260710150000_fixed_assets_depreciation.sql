-- Mini-ERP: fixed asset register + straight-line depreciation. The COA
-- already had a "1-500 Peralatan" account but nothing ever wrote to it —
-- equipment purchases were being expensed in full via Keuangan instead of
-- capitalized and depreciated over time.
--
-- Adds "1-501 Akumulasi Penyusutan" as an aset-type account with
-- normal_balance = 'debit' (matching every other aset account) even though
-- it's only ever *credited* — that's deliberate: this app's Neraca sums every
-- aset account's balance directly into Total Aset with no per-account
-- sign-flipping, so keeping normal_balance='debit' here means its balance
-- goes negative as depreciation accrues, which correctly *reduces* Total
-- Aset without needing any special-cased contra-account handling elsewhere.
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

do $$
declare
  b record;
begin
  for b in select id from public.businesses loop
    perform private.seed_default_accounts(b.id);
  end loop;
end;
$$;

create table public.fixed_assets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  purchase_date date not null,
  cost numeric(14, 2) not null check (cost > 0),
  useful_life_months int not null check (useful_life_months > 0),
  salvage_value numeric(14, 2) not null default 0 check (salvage_value >= 0),
  accumulated_depreciation numeric(14, 2) not null default 0,
  disposed_at timestamptz,
  created_at timestamptz not null default now()
);

create index fixed_assets_business_id_idx on public.fixed_assets (business_id);

alter table public.fixed_assets enable row level security;

create policy "Owner manages fixed assets of own businesses"
on public.fixed_assets for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- One row per business per calendar month depreciation was posted, so the
-- same month can never be double-posted.
create table public.depreciation_postings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  period date not null, -- first day of the depreciated month
  total_amount numeric(14, 2) not null,
  journal_entry_id uuid references public.journal_entries (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, period)
);

create index depreciation_postings_business_id_idx on public.depreciation_postings (business_id, period desc);

alter table public.depreciation_postings enable row level security;

create policy "Owner views depreciation postings of own businesses"
on public.depreciation_postings for select
using (private.owns_business(business_id));
