-- Kunci visibilitas mirror per bulan. Owner bisa kunci satu bulan sehingga
-- tanda transaksi di bulan tersebut tidak bisa diubah sampai dibuka kembali.

create table public.mirror_month_locks (
  id           uuid default gen_random_uuid() primary key,
  business_id  uuid not null references public.businesses(id) on delete cascade,
  month_year   date not null, -- hari pertama bulan: 2026-07-01
  locked_at    timestamptz not null default now(),
  locked_by    uuid not null references auth.users(id),
  unique (business_id, month_year)
);

alter table public.mirror_month_locks enable row level security;

create policy "owner manages mirror month locks"
  on public.mirror_month_locks for all
  using  (private.owns_business(business_id))
  with check (private.owns_business(business_id));

-- Trigger: tolak INSERT/DELETE di mirror_visible_transactions jika bulan terkunci.
create or replace function private.check_mirror_tx_month_lock()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare
  v_month  date;
  v_biz_id uuid;
  v_tx_id  uuid;
begin
  if TG_OP = 'DELETE' then
    v_biz_id := OLD.business_id;
    v_tx_id  := OLD.transaction_id;
  else
    v_biz_id := NEW.business_id;
    v_tx_id  := NEW.transaction_id;
  end if;

  select date_trunc('month', date at time zone 'Asia/Jakarta')::date
  into v_month
  from public.transactions
  where id = v_tx_id;

  if exists (
    select 1 from public.mirror_month_locks
    where business_id = v_biz_id
      and month_year = v_month
  ) then
    raise exception 'Bulan % sudah dikunci. Buka kunci terlebih dahulu di halaman Mirror.',
      to_char(v_month, 'Mon YYYY');
  end if;

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

create trigger mirror_tx_month_lock_check
  before insert or delete on public.mirror_visible_transactions
  for each row execute function private.check_mirror_tx_month_lock();
