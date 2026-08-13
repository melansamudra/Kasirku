-- close_shift sebelumnya menghitung total_sales dari transaction_payments.amount
-- (jumlah yang diterima) bukan dari transactions.total (net setelah void item).
-- Akibatnya, item yang di-void sebelum tutup shift tidak mengurangi total di
-- laporan tutup shift. Perbaikan: hitung total_sales dari sum(transactions.total)
-- yang sudah dikurangi oleh void_transaction_item.
--
-- cash_sales & non_cash_sales tetap dari transaction_payments (jumlah fisik yang
-- diterima lewat masing-masing metode). Selisih antara keduanya dengan total_sales
-- mencerminkan refund void item. expected_cash & difference tetap berbasis
-- cash_sales karena berhubungan dengan laci kas fisik, bukan laporan pendapatan.

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
  v_business_id  uuid;
  v_opening_cash numeric(12, 2);
  v_cash_sales   numeric(12, 2) := 0;
  v_non_cash_sales numeric(12, 2) := 0;
  v_total_sales  numeric(12, 2) := 0;
  v_tx_count     int := 0;
  v_void_count   int := 0;
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

  -- Net total dari transactions.total (sudah dipotong void item)
  select coalesce(sum(t.total), 0)
  into v_total_sales
  from public.transactions t
  where t.shift_id = p_shift_id and not t.voided;

  -- Per-metode dari payment amounts (jumlah fisik yang diterima kasir)
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

  update public.shifts s
  set closed_at      = now(),
      closing_cash   = p_closing_cash,
      close_notes    = p_close_notes,
      cash_sales     = v_cash_sales,
      non_cash_sales = v_non_cash_sales,
      total_sales    = v_total_sales,
      expected_cash  = v_opening_cash + v_cash_sales,
      difference     = p_closing_cash - (v_opening_cash + v_cash_sales),
      tx_count       = v_tx_count,
      void_count     = v_void_count
  where s.id = p_shift_id;

  return query
  select
    v_cash_sales,
    v_non_cash_sales,
    v_total_sales,
    v_opening_cash + v_cash_sales,
    p_closing_cash - (v_opening_cash + v_cash_sales),
    v_tx_count,
    v_void_count;
end;
$$;

grant execute on function public.close_shift(uuid, numeric, text) to authenticated;
