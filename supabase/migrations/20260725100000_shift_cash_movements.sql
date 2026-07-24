-- Link ad-hoc cash movements (kas masuk/keluar dari laci) recorded during a
-- cashier shift to that shift, so close_shift's cash reconciliation actually
-- accounts for them. Previously "Kas Harian" cash entries had no way to
-- attach to a shift, so any till cash movement during a shift was invisible
-- to expected_cash/difference.

alter table public.journal_entries drop constraint if exists journal_entries_source_check;
alter table public.journal_entries add constraint journal_entries_source_check
  check (source in ('manual', 'penjualan', 'void', 'pembelian', 'beban', 'payroll', 'tutup_buku', 'koreksi', 'shift'));

-- Same debit/credit shape as post_journal_entry's Kas Harian callers
-- (kas-harian/actions.ts), but scoped to an open shift via source='shift' /
-- source_id=shift_id so close_shift can find it.
create or replace function public.post_shift_cash_movement(
  p_business_id uuid,
  p_shift_id uuid,
  p_direction text, -- 'in' | 'out'
  p_amount numeric,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
  v_lines jsonb;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if p_direction not in ('in', 'out') then
    raise exception 'invalid direction';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  if p_description is null or length(trim(p_description)) = 0 then
    raise exception 'description required';
  end if;

  if not exists (
    select 1 from public.shifts s
    where s.id = p_shift_id and s.business_id = p_business_id and s.closed_at is null
  ) then
    raise exception 'shift not found or already closed';
  end if;

  v_lines := case
    when p_direction = 'in' then
      jsonb_build_array(
        jsonb_build_object('account_code', '1-001', 'debit', p_amount, 'credit', 0),
        jsonb_build_object('account_code', '4-999', 'debit', 0, 'credit', p_amount)
      )
    else
      jsonb_build_array(
        jsonb_build_object('account_code', '5-999', 'debit', p_amount, 'credit', 0),
        jsonb_build_object('account_code', '1-001', 'debit', 0, 'credit', p_amount)
      )
  end;

  v_entry_id := private.post_journal(
    p_business_id, now(), p_description, 'shift', p_shift_id, v_lines
  );

  return v_entry_id;
end;
$$;

grant execute on function public.post_shift_cash_movement(uuid, uuid, text, numeric, text) to authenticated;

-- close_shift: also fold shift-linked cash movements (kas masuk/keluar) into
-- the expected-cash reconciliation, not just cash sales.
create or replace function public.close_shift(
  p_shift_id uuid,
  p_closing_cash numeric,
  p_close_notes text default null
)
returns table (
  cash_sales numeric,
  non_cash_sales numeric,
  total_sales numeric,
  expected_cash numeric,
  difference numeric,
  tx_count int,
  void_count int
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_opening_cash numeric(12, 2);
  v_cash_sales numeric(12, 2) := 0;
  v_non_cash_sales numeric(12, 2) := 0;
  v_cash_movement_delta numeric(12, 2) := 0;
  v_tx_count int := 0;
  v_void_count int := 0;
begin
  select s.business_id, s.opening_cash into v_business_id, v_opening_cash
  from public.shifts s
  where s.id = p_shift_id and s.closed_at is null;

  if not found then
    raise exception 'shift not found or already closed';
  end if;

  if not private.owns_business(v_business_id) then
    raise exception 'not authorized';
  end if;

  if p_closing_cash is null or p_closing_cash < 0 then
    raise exception 'invalid closing cash';
  end if;

  select
    coalesce(sum(tp.amount) filter (where tp.method = 'Tunai'), 0),
    coalesce(sum(tp.amount) filter (where tp.method != 'Tunai'), 0)
  into v_cash_sales, v_non_cash_sales
  from public.transactions t
  join public.transaction_payments tp on tp.transaction_id = t.id
  where t.shift_id = p_shift_id and not t.voided;

  select
    count(*) filter (where not t.voided),
    count(*) filter (where t.voided)
  into v_tx_count, v_void_count
  from public.transactions t
  where t.shift_id = p_shift_id;

  select coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0)
  into v_cash_movement_delta
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.entry_id
  join public.accounts a on a.id = jl.account_id
  where je.business_id = v_business_id
    and je.source = 'shift'
    and je.source_id = p_shift_id
    and a.code = '1-001';

  update public.shifts s
  set closed_at = now(),
      closing_cash = p_closing_cash,
      close_notes = p_close_notes,
      cash_sales = v_cash_sales,
      non_cash_sales = v_non_cash_sales,
      total_sales = v_cash_sales + v_non_cash_sales,
      expected_cash = v_opening_cash + v_cash_sales + v_cash_movement_delta,
      difference = p_closing_cash - (v_opening_cash + v_cash_sales + v_cash_movement_delta),
      tx_count = v_tx_count,
      void_count = v_void_count
  where s.id = p_shift_id;

  return query
  select
    v_cash_sales,
    v_non_cash_sales,
    v_cash_sales + v_non_cash_sales,
    v_opening_cash + v_cash_sales + v_cash_movement_delta,
    p_closing_cash - (v_opening_cash + v_cash_sales + v_cash_movement_delta),
    v_tx_count,
    v_void_count;
end;
$$;

grant execute on function public.close_shift(uuid, numeric, text) to authenticated;
