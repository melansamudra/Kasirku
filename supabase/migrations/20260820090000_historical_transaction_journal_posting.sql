-- Transaksi manual & impor Moka POS (create_historical_transaction,
-- import_historical_transactions_bulk) selama ini cuma insert ke tabel
-- transactions/transaction_payments — tidak pernah posting ke jurnal seperti
-- checkout_transaction. Akibatnya mereka ikut terhitung sebagai omset di
-- Laporan Laba Rugi (baca dari tabel transactions), tapi tidak pernah
-- muncul di Jurnal Transaksi atau Kas & Bank (baca dari journal_entries).
-- Disamakan di sini: posting Debit Kas & Bank / Kredit Pendapatan Penjualan
-- memakai tanggal transaksi aslinya (bukan tanggal impor), sama seperti pola
-- checkout_transaction.

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

  if p_total > 0 then
    perform private.post_journal(
      p_business_id, p_date, 'Penjualan ' || v_invoice_number, 'penjualan', v_transaction_id,
      jsonb_build_array(
        jsonb_build_object('account_code', '1-001', 'debit', p_total, 'credit', 0),
        jsonb_build_object('account_code', '4-001', 'debit', 0, 'credit', p_total)
      )
    );
  end if;

  return query select v_transaction_id, v_invoice_number;
end;
$$;

grant execute on function public.create_historical_transaction(uuid, timestamptz, text, numeric, text) to authenticated;

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

      if v_total > 0 then
        perform private.post_journal(
          p_business_id, v_date, 'Penjualan ' || v_invoice_number, 'penjualan', v_transaction_id,
          jsonb_build_array(
            jsonb_build_object('account_code', '1-001', 'debit', v_total, 'credit', 0),
            jsonb_build_object('account_code', '4-001', 'debit', 0, 'credit', v_total)
          )
        );
      end if;

      v_created := v_created + 1;
    exception when others then
      v_skipped := v_skipped + 1;
    end;
  end loop;

  return query select v_created, v_skipped;
end;
$$;

grant execute on function public.import_historical_transactions_bulk(uuid, jsonb) to authenticated;
