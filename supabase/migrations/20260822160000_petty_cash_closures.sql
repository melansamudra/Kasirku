-- Tutup Petty Cash: snapshot resmi (sekali cetak, bukan angka live) dari
-- rekonsiliasi harian kas kecil -- sama fungsinya dengan close_shift() untuk
-- shift kasir, tapi untuk petty cash. Angka dihitung ulang di server (bukan
-- dipercaya dari browser), sama seperti close_shift.

create table public.petty_cash_closures (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  date date not null,
  total_allocated numeric(12, 2) not null default 0,
  total_tunai numeric(12, 2) not null default 0,
  total_hutang numeric(12, 2) not null default 0,
  hutang_count int not null default 0,
  expected_remaining numeric(12, 2) not null default 0,
  actual_remaining numeric(12, 2) not null,
  difference numeric(12, 2) not null default 0,
  notes text,
  closed_by uuid references auth.users (id) on delete set null,
  closed_at timestamptz not null default now(),
  unique (business_id, date)
);

create index petty_cash_closures_business_id_date_idx on public.petty_cash_closures (business_id, date);

alter table public.petty_cash_closures enable row level security;

create policy "Owner manages petty cash closures of own businesses"
on public.petty_cash_closures for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- p_from/p_to (timestamptz) dihitung di aplikasi (mengikuti konvensi WIB day
-- boundary yang sudah dipakai di reports/period.ts) supaya logic timezone
-- tetap satu tempat, bukan diduplikasi di SQL.
create or replace function public.close_petty_cash(
  p_business_id uuid,
  p_date date,
  p_from timestamptz,
  p_to timestamptz,
  p_actual_remaining numeric,
  p_notes text default null
)
returns public.petty_cash_closures
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total_allocated numeric(12, 2);
  v_total_tunai numeric(12, 2);
  v_total_hutang numeric(12, 2);
  v_hutang_count int;
  v_expected numeric(12, 2);
  v_row public.petty_cash_closures;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if exists (
    select 1 from public.petty_cash_closures
    where business_id = p_business_id and date = p_date
  ) then
    raise exception 'Petty cash tanggal ini sudah ditutup.';
  end if;

  if p_actual_remaining is null or p_actual_remaining < 0 then
    raise exception 'invalid actual remaining';
  end if;

  select coalesce(sum(amount), 0) into v_total_allocated
  from public.petty_cash_allocations
  where business_id = p_business_id and date = p_date;

  -- Sama seperti kartu "Total Nota Hari Ini" di halaman Kas Kecil: rejected
  -- dikeluarkan karena uangnya sudah kembali ke kas.
  select coalesce(sum(amount), 0) into v_total_tunai
  from public.shift_cash_movements
  where business_id = p_business_id
    and direction = 'out'
    and status != 'rejected'
    and created_at >= p_from
    and created_at < p_to;

  select coalesce(sum(amount), 0), count(*) into v_total_hutang, v_hutang_count
  from public.supplier_debt_notes
  where business_id = p_business_id
    and created_at >= p_from
    and created_at < p_to;

  v_expected := v_total_allocated - v_total_tunai;

  insert into public.petty_cash_closures (
    business_id, date, total_allocated, total_tunai, total_hutang, hutang_count,
    expected_remaining, actual_remaining, difference, notes, closed_by
  ) values (
    p_business_id, p_date, v_total_allocated, v_total_tunai, v_total_hutang, v_hutang_count,
    v_expected, p_actual_remaining, p_actual_remaining - v_expected, p_notes, auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.close_petty_cash(uuid, date, timestamptz, timestamptz, numeric, text) to authenticated;
