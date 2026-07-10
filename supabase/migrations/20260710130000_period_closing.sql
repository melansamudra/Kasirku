-- Formal tutup buku (period closing). Before this, Neraca's "Laba Berjalan"
-- was always recomputed from every pendapatan/beban journal line since the
-- business's inception — there was no way to lock in a period's profit.
-- close_accounting_period() posts a closing entry that zeroes every
-- pendapatan/beban account's balance as of the chosen date and rolls the net
-- difference into 3-100 Laba Ditahan (retained earnings), which already
-- existed in the COA but nothing ever posted to it. Because the zeroing is
-- against each account's all-time cumulative balance (not a separate
-- "since last close" window), running the same balance query again after a
-- closing naturally reflects only activity since that closing — no other
-- report needs to change.
alter table public.journal_entries drop constraint if exists journal_entries_source_check;
alter table public.journal_entries add constraint journal_entries_source_check
  check (source in ('manual', 'penjualan', 'void', 'pembelian', 'beban', 'payroll', 'tutup_buku'));

create table public.period_closings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  period_end date not null,
  net_income numeric(14, 2) not null,
  journal_entry_id uuid references public.journal_entries (id) on delete set null,
  closed_at timestamptz not null default now(),
  unique (business_id, period_end)
);

create index period_closings_business_id_idx on public.period_closings (business_id, period_end desc);

alter table public.period_closings enable row level security;

-- Read-only from the client — writes only happen through
-- close_accounting_period(), which validates ownership itself.
create policy "Owner views period closings of own businesses"
on public.period_closings for select
using (private.owns_business(business_id));

create or replace function public.close_accounting_period(
  p_business_id uuid,
  p_period_end date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_as_of timestamptz;
  v_last_closed date;
  v_account record;
  v_lines jsonb := '[]'::jsonb;
  v_total_pendapatan numeric(14, 2) := 0;
  v_total_beban numeric(14, 2) := 0;
  v_net_income numeric(14, 2);
  v_entry_id uuid;
  v_closing_id uuid;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if p_period_end > current_date then
    raise exception 'tanggal tutup buku tidak boleh di masa depan';
  end if;

  select max(period_end) into v_last_closed
  from public.period_closings
  where business_id = p_business_id;

  if v_last_closed is not null and p_period_end <= v_last_closed then
    raise exception 'tanggal harus setelah tutup buku terakhir (%)', v_last_closed;
  end if;

  v_as_of := (p_period_end::text || 'T23:59:59+07:00')::timestamptz;

  for v_account in
    select a.id, a.code, a.type,
      coalesce(sum(jl.debit) - sum(jl.credit), 0) as raw_balance
    from public.accounts a
    left join public.journal_lines jl on jl.account_id = a.id
    left join public.journal_entries je on je.id = jl.entry_id and je.date <= v_as_of
    where a.business_id = p_business_id and a.type in ('pendapatan', 'beban')
    group by a.id, a.code, a.type
    having coalesce(sum(jl.debit) - sum(jl.credit), 0) <> 0
  loop
    if v_account.type = 'pendapatan' then
      -- Credit-normal: raw_balance is negative when there's revenue booked.
      -- Debit it by the same magnitude to bring the cumulative balance to 0.
      v_lines := v_lines || jsonb_build_object(
        'account_code', v_account.code, 'debit', -v_account.raw_balance, 'credit', 0
      );
      v_total_pendapatan := v_total_pendapatan + (-v_account.raw_balance);
    else
      -- beban is debit-normal: raw_balance is positive when there's expense.
      -- Credit it by the same magnitude to zero it out.
      v_lines := v_lines || jsonb_build_object(
        'account_code', v_account.code, 'debit', 0, 'credit', v_account.raw_balance
      );
      v_total_beban := v_total_beban + v_account.raw_balance;
    end if;
  end loop;

  if jsonb_array_length(v_lines) = 0 then
    raise exception 'tidak ada transaksi pendapatan/beban untuk ditutup pada periode ini';
  end if;

  v_net_income := v_total_pendapatan - v_total_beban;

  if v_net_income >= 0 then
    v_lines := v_lines || jsonb_build_object('account_code', '3-100', 'debit', 0, 'credit', v_net_income);
  else
    v_lines := v_lines || jsonb_build_object('account_code', '3-100', 'debit', -v_net_income, 'credit', 0);
  end if;

  v_entry_id := private.post_journal(
    p_business_id, v_as_of, 'Tutup Buku periode s/d ' || p_period_end::text, 'tutup_buku', null, v_lines
  );

  insert into public.period_closings (business_id, period_end, net_income, journal_entry_id)
  values (p_business_id, p_period_end, v_net_income, v_entry_id)
  returning id into v_closing_id;

  return v_closing_id;
end;
$$;

grant execute on function public.close_accounting_period(uuid, date) to authenticated;
