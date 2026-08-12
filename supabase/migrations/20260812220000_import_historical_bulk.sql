-- Fungsi bulk import transaksi historis dari Moka POS.
-- Memproses semua transaksi dalam satu panggilan database
-- sehingga tidak timeout di Vercel free plan.

create or replace function public.import_historical_transactions_bulk(
  p_business_id uuid,
  p_transactions jsonb
)
returns table (created int, skipped int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx jsonb;
  v_transaction_id uuid;
  v_invoice_number text;
  v_date timestamptz;
  v_total numeric;
  v_catatan text;
  v_payment text;
  v_created int := 0;
  v_skipped int := 0;
  v_date_key text;
  v_day_seq int;
  v_date_counts jsonb := '{}'::jsonb;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  for v_tx in select * from jsonb_array_elements(p_transactions)
  loop
    begin
      v_date    := (v_tx->>'date')::timestamptz;
      v_total   := (v_tx->>'total')::numeric;
      v_catatan := nullif(trim(v_tx->>'catatan'), '');
      v_payment := coalesce(nullif(trim(v_tx->>'paymentMethod'), ''), 'Tunai');

      if v_date is null or v_total is null or v_total < 0 then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      -- Hitung nomor urut invoice per tanggal
      v_date_key := to_char(v_date at time zone 'Asia/Jakarta', 'YYYYMMDD');

      if v_date_counts ? v_date_key then
        v_day_seq := (v_date_counts ->> v_date_key)::int + 1;
      else
        select coalesce(max(
          (regexp_match(invoice_number, 'MAN-\d{8}-(\d+)'))[1]::int
        ), 0) + 1
        into v_day_seq
        from public.transactions
        where business_id = p_business_id
          and (date at time zone 'Asia/Jakarta')::date = (v_date at time zone 'Asia/Jakarta')::date
          and invoice_number like 'MAN-%';
      end if;

      v_date_counts := jsonb_set(
        v_date_counts, array[v_date_key], to_jsonb(v_day_seq)
      );

      v_invoice_number := 'MAN-' || v_date_key || '-' || lpad(v_day_seq::text, 4, '0');

      insert into public.transactions (
        business_id, shift_id, cashier_id, customer_id,
        invoice_number, date,
        subtotal_raw, subtotal, total, total_cost, gross_profit,
        catatan
      ) values (
        p_business_id, null, null, null,
        v_invoice_number, v_date,
        v_total, v_total, v_total, 0, 0,
        v_catatan
      )
      returning id into v_transaction_id;

      insert into public.transaction_payments (
        transaction_id, method, amount, received, change
      ) values (
        v_transaction_id, v_payment, v_total, v_total, 0
      );

      v_created := v_created + 1;
    exception when others then
      v_skipped := v_skipped + 1;
    end;
  end loop;

  return query select v_created, v_skipped;
end;
$$;

grant execute on function public.import_historical_transactions_bulk(uuid, jsonb) to authenticated;
