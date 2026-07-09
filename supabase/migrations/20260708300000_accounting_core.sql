-- Mini-ERP accounting module, part 1: Chart of Accounts + double-entry
-- journal. Additive only — does not touch existing checkout/expense/payroll
-- behavior in this migration (auto-posting is wired in follow-up migrations).

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  code text not null,
  name text not null,
  type text not null check (type in ('aset', 'kewajiban', 'modal', 'pendapatan', 'beban')),
  normal_balance text not null check (normal_balance in ('debit', 'kredit')),
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index accounts_business_id_code_key on public.accounts (business_id, code);
create index accounts_business_id_idx on public.accounts (business_id);

alter table public.accounts enable row level security;

create policy "Owner manages accounts of own businesses"
on public.accounts for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Journal entries (header) ---------------------------------------------------

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  date timestamptz not null default now(),
  description text not null,
  source text not null default 'manual' check (
    source in ('manual', 'penjualan', 'void', 'pembelian', 'beban', 'payroll')
  ),
  source_id uuid,
  created_at timestamptz not null default now()
);

create index journal_entries_business_id_idx on public.journal_entries (business_id);
create index journal_entries_source_idx on public.journal_entries (source, source_id);

alter table public.journal_entries enable row level security;

-- Read-only from the client's perspective — every entry must balance, so
-- writes only ever happen through private.post_journal() (called from
-- security-definer RPCs). Direct client inserts/updates/deletes would risk
-- unbalanced entries, so no write policy is granted here.
create policy "Owner views journal entries of own businesses"
on public.journal_entries for select
using (private.owns_business(business_id));

-- Journal lines (debit/credit rows) ------------------------------------------

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries (id) on delete cascade,
  account_id uuid not null references public.accounts (id),
  debit numeric(14, 2) not null default 0,
  credit numeric(14, 2) not null default 0,
  constraint journal_lines_one_sided check (
    (debit > 0 and credit = 0) or (credit > 0 and debit = 0)
  )
);

create index journal_lines_entry_id_idx on public.journal_lines (entry_id);
create index journal_lines_account_id_idx on public.journal_lines (account_id);

alter table public.journal_lines enable row level security;

create policy "Owner views journal lines of own businesses"
on public.journal_lines for select
using (
  exists (
    select 1 from public.journal_entries je
    where je.id = journal_lines.entry_id
      and private.owns_business(je.business_id)
  )
);

-- Default Indonesian F&B/retail chart of accounts ----------------------------

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
    (p_business_id, '5-999', 'Beban Lain-lain', 'beban', 'debit', true)
  on conflict (business_id, code) do nothing;
end;
$$;

create or replace function private.on_business_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_default_accounts(new.id);
  return new;
end;
$$;

create trigger businesses_seed_accounts
after insert on public.businesses
for each row execute function private.on_business_created();

-- Backfill for businesses that already existed before this migration.
do $$
declare
  b record;
begin
  for b in select id from public.businesses loop
    perform private.seed_default_accounts(b.id);
  end loop;
end;
$$;

-- Mechanical double-entry helper — inserts a balanced entry + its lines.
-- Callers (security-definer RPCs) are responsible for auth/ownership checks;
-- this function trusts p_business_id and only enforces that debits = credits.
create or replace function private.post_journal(
  p_business_id uuid,
  p_date timestamptz,
  p_description text,
  p_source text,
  p_source_id uuid,
  p_lines jsonb -- array of {account_code, debit, credit}
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_entry_id uuid;
  v_line jsonb;
  v_account_id uuid;
  v_total_debit numeric(14, 2) := 0;
  v_total_credit numeric(14, 2) := 0;
  v_debit numeric(14, 2);
  v_credit numeric(14, 2);
begin
  if p_lines is null or jsonb_array_length(p_lines) < 2 then
    raise exception 'journal entry needs at least 2 lines';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_debit := coalesce((v_line ->> 'debit')::numeric, 0);
    v_credit := coalesce((v_line ->> 'credit')::numeric, 0);
    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
  end loop;

  if round(v_total_debit, 2) <> round(v_total_credit, 2) then
    raise exception 'unbalanced journal entry: debit % <> credit %', v_total_debit, v_total_credit;
  end if;

  insert into public.journal_entries (business_id, date, description, source, source_id)
  values (p_business_id, p_date, p_description, p_source, p_source_id)
  returning id into v_entry_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select id into v_account_id
    from public.accounts
    where business_id = p_business_id and code = (v_line ->> 'account_code');

    if v_account_id is null then
      raise exception 'account not found: %', (v_line ->> 'account_code');
    end if;

    insert into public.journal_lines (entry_id, account_id, debit, credit)
    values (
      v_entry_id,
      v_account_id,
      coalesce((v_line ->> 'debit')::numeric, 0),
      coalesce((v_line ->> 'credit')::numeric, 0)
    );
  end loop;

  return v_entry_id;
end;
$$;

-- Public RPC for manual journal entries from the client.
create or replace function public.post_journal_entry(
  p_business_id uuid,
  p_date timestamptz,
  p_description text,
  p_lines jsonb -- array of {account_code, debit, credit}
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if p_description is null or length(trim(p_description)) = 0 then
    raise exception 'description required';
  end if;

  v_entry_id := private.post_journal(
    p_business_id, coalesce(p_date, now()), p_description, 'manual', null, p_lines
  );

  return v_entry_id;
end;
$$;

grant execute on function public.post_journal_entry(uuid, timestamptz, text, jsonb) to authenticated;
