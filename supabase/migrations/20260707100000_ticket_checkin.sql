-- Module: validasi masuk (check-in) untuk tiket yang sudah terjual. Sebelum
-- ini, sistem cuma mencatat penjualan — tidak ada yang mencegah satu tiket
-- fisik dipakai masuk berkali-kali, dan petugas gerbang tidak punya cara
-- memverifikasi keaslian tiket tanpa balik ke kasir.

alter table public.ticket_serials
  add column checked_in_at timestamptz,
  add column checked_in_by uuid references public.cashiers(id);

create index ticket_serials_checked_in_at_idx
  on public.ticket_serials (business_id, checked_in_at)
  where checked_in_at is not null;

-- check_in_ticket: dicari per (business, kategori, nomor tiket fisik) karena
-- buku tiket kertas terpisah per kategori (lihat migration manual_number),
-- jadi nomor yang sama bisa muncul di kategori lain.
create or replace function public.check_in_ticket(
  p_business_id uuid,
  p_cashier_id uuid,
  p_ticket_category_id uuid,
  p_manual_number text
)
returns table (
  category_name text,
  price numeric,
  is_member_price boolean,
  invoice_number text,
  sold_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_serial_id uuid;
  v_voided boolean;
  v_checked_in_at timestamptz;
  v_category_name text;
  v_price numeric;
  v_is_member_price boolean;
  v_invoice_number text;
  v_sold_at timestamptz;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if not exists (
    select 1 from public.cashiers c
    where c.id = p_cashier_id and c.business_id = p_business_id and c.active
  ) then
    raise exception 'invalid cashier';
  end if;

  select s.id, t.voided, s.checked_in_at, cat.name, s.price, s.is_member_price,
         t.invoice_number, t.date
  into v_serial_id, v_voided, v_checked_in_at, v_category_name, v_price,
       v_is_member_price, v_invoice_number, v_sold_at
  from public.ticket_serials s
  join public.ticket_categories cat on cat.id = s.ticket_category_id
  join public.ticket_transactions t on t.id = s.ticket_transaction_id
  where s.business_id = p_business_id
    and s.ticket_category_id = p_ticket_category_id
    and s.manual_number = trim(p_manual_number)
  for update of s;

  if v_serial_id is null then
    raise exception 'Nomor tiket tidak ditemukan untuk kategori ini.';
  end if;

  if v_voided then
    raise exception 'Tiket ini sudah dibatalkan (void), tidak bisa dipakai masuk.';
  end if;

  if v_checked_in_at is not null then
    raise exception 'Tiket ini sudah dipakai masuk pada %',
      to_char(v_checked_in_at at time zone 'Asia/Jakarta', 'DD Mon YYYY, HH24:MI');
  end if;

  update public.ticket_serials
  set checked_in_at = now(), checked_in_by = p_cashier_id
  where id = v_serial_id;

  return query select v_category_name, v_price, v_is_member_price, v_invoice_number, v_sold_at;
end;
$$;

grant execute on function public.check_in_ticket(uuid, uuid, uuid, text) to authenticated;
