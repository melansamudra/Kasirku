-- Fungsi impor transaksi historis dari sumber eksternal (mis. Moka POS).
-- Nominal diambil langsung dari sumber — tidak perlu lookup produk KasirKu.
-- Nama menu asli disimpan di kolom catatan.

create or replace function public.create_historical_transaction(
  p_business_id uuid,
  p_date timestamptz,
  p_payment_method text,
  p_total numeric,
  p_catatan text default null
)
returns table (transaction_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_number text;
  v_seq int;
  v_transaction_id uuid;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if p_date is null or p_date > now() then
    raise exception 'invalid date';
  end if;

  if p_payment_method is null or length(trim(p_payment_method)) = 0 then
    raise exception 'payment method required';
  end if;

  if p_total is null or p_total < 0 then
    raise exception 'invalid total';
  end if;

  select count(*) + 1 into v_seq
  from public.transactions t
  where t.business_id = p_business_id
    and t.date::date = p_date::date
    and t.invoice_number like 'MAN-%';

  v_invoice_number := 'MAN-' || to_char(p_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.transactions (
    business_id, shift_id, cashier_id, customer_id, invoice_number, date,
    subtotal_raw, subtotal, total, total_cost, gross_profit, catatan
  ) values (
    p_business_id, null, null, null, v_invoice_number, p_date,
    p_total, p_total, p_total, 0, p_total, p_catatan
  )
  returning id into v_transaction_id;

  insert into public.transaction_payments (
    transaction_id, method, amount, received, change
  ) values (
    v_transaction_id, p_payment_method, p_total, p_total, 0
  );

  return query select v_transaction_id, v_invoice_number;
end;
$$;

grant execute on function public.create_historical_transaction(uuid, timestamptz, text, numeric, text) to authenticated;
