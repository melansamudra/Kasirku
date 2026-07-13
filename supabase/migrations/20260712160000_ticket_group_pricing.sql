-- Group/rombongan pricing: a category can optionally offer a cheaper
-- per-ticket price once a minimum quantity is bought in the same
-- transaction. Whole-cart-line pricing (not per-unit-added), matching how
-- weekday/holiday/member pricing already applies uniformly to every ticket
-- in a category within one checkout — once the Nth ticket crosses the
-- threshold, every ticket in that category (including earlier ones in the
-- same cart) gets the group price. Optional: group_price null/0 or
-- group_min_qty 0 means "no group pricing for this category".
alter table public.ticket_categories
  add column group_min_qty integer not null default 0,
  add column group_price numeric(12, 2);

create or replace function public.checkout_ticket_transaction(
  p_business_id uuid,
  p_cashier_id uuid,
  p_items jsonb, -- array of {ticket_category_id, manual_numbers: string[]}
  p_payment_method text,
  p_received numeric default null,
  p_member_id uuid default null
)
returns table (transaction_id uuid, invoice_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_member record;
  v_invoice_number text;
  v_seq int;
  v_is_holiday boolean;
  v_subtotal numeric(12, 2) := 0;
  v_service numeric(12, 2) := 0;
  v_tax numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_change numeric(12, 2);
  v_transaction_id uuid;
  v_shift_id uuid;
  v_item jsonb;
  v_category_id uuid;
  v_category record;
  v_manual_numbers jsonb;
  v_manual_number text;
  v_use_member_price boolean := false;
  v_unit_price numeric(12, 2);
  v_qty int;
  v_serial int;
  v_journal_lines jsonb;
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

  if p_payment_method is null or length(trim(p_payment_method)) = 0 then
    raise exception 'payment method required';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'cart is empty';
  end if;

  select b.tax_enabled, b.tax_rate, b.service_enabled, b.service_rate
  into v_business
  from public.businesses b
  where b.id = p_business_id;

  select id into v_shift_id
  from public.shifts
  where business_id = p_business_id and closed_at is null
  limit 1;

  if v_shift_id is null then
    raise exception 'no active shift — open a shift before selling';
  end if;

  if p_member_id is not null then
    select m.id, m.valid_from, m.valid_until
    into v_member
    from public.members m
    where m.id = p_member_id
      and m.business_id = p_business_id
      and m.deleted_at is null;

    if not found then
      raise exception 'member not found';
    end if;

    if current_date < v_member.valid_from or current_date > v_member.valid_until then
      raise exception 'membership tidak aktif (kadaluarsa atau belum berlaku)';
    end if;

    v_use_member_price := true;
  end if;

  v_is_holiday := extract(dow from current_date) in (0, 6)
    or exists (
      select 1 from public.ticket_holidays h
      where h.business_id = p_business_id and h.holiday_date = current_date
    );

  select count(*) + 1 into v_seq
  from public.ticket_transactions t
  where t.business_id = p_business_id
    and t.date::date = current_date;

  v_invoice_number := 'TIX-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.ticket_transactions (
    business_id, shift_id, cashier_id, member_id, invoice_number, date,
    is_holiday, subtotal, service, tax, total, payment_method, received, change
  ) values (
    p_business_id, v_shift_id, p_cashier_id, p_member_id, v_invoice_number, now(),
    v_is_holiday, 0, 0, 0, 0, p_payment_method, p_received, 0
  )
  returning id into v_transaction_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_category_id := (v_item ->> 'ticket_category_id')::uuid;
    v_manual_numbers := v_item -> 'manual_numbers';

    if v_manual_numbers is null or jsonb_typeof(v_manual_numbers) <> 'array'
      or jsonb_array_length(v_manual_numbers) = 0 then
      raise exception 'manual ticket numbers required for category %', v_category_id;
    end if;

    select * into v_category
    from public.ticket_categories
    where id = v_category_id
      and business_id = p_business_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'ticket category not found: %', v_category_id;
    end if;

    v_qty := jsonb_array_length(v_manual_numbers);

    v_unit_price := case
      when v_use_member_price then v_category.member_price
      when v_category.group_min_qty > 0 and v_category.group_price is not null
        and v_qty >= v_category.group_min_qty then v_category.group_price
      when v_is_holiday then v_category.price_holiday
      else v_category.price_weekday
    end;

    for v_manual_number in select jsonb_array_elements_text(v_manual_numbers)
    loop
      if v_manual_number is null or length(trim(v_manual_number)) = 0 then
        raise exception 'nomor tiket fisik tidak boleh kosong (kategori %)', v_category.name;
      end if;

      v_serial := v_category.next_serial;

      insert into public.ticket_serials (
        ticket_transaction_id, ticket_category_id, business_id,
        serial_no, manual_number, price, is_member_price
      ) values (
        v_transaction_id, v_category_id, p_business_id,
        v_serial, trim(v_manual_number), v_unit_price, v_use_member_price
      );

      v_category.next_serial := v_category.next_serial + 1;
      v_subtotal := v_subtotal + v_unit_price;
    end loop;

    update public.ticket_categories
    set next_serial = v_category.next_serial
    where id = v_category_id;
  end loop;

  if v_business.service_enabled then
    v_service := round(v_subtotal * v_business.service_rate / 100);
  end if;

  if v_business.tax_enabled then
    v_tax := round((v_subtotal + v_service) * v_business.tax_rate / 100);
  end if;

  v_total := v_subtotal + v_service + v_tax;
  v_change := greatest(coalesce(p_received, v_total) - v_total, 0);

  update public.ticket_transactions
  set subtotal = v_subtotal,
      service = v_service,
      tax = v_tax,
      total = v_total,
      change = v_change
  where id = v_transaction_id;

  -- Revenue-only posting — no HPP/Persediaan lines exist for tickets.
  v_journal_lines := '[]'::jsonb;
  if v_total > 0 then
    v_journal_lines := v_journal_lines || jsonb_build_array(
      jsonb_build_object('account_code', '1-001', 'debit', v_total, 'credit', 0),
      jsonb_build_object('account_code', '4-002', 'debit', 0, 'credit', v_subtotal + v_service)
    );
    if v_tax > 0 then
      v_journal_lines := v_journal_lines || jsonb_build_array(
        jsonb_build_object('account_code', '2-200', 'debit', 0, 'credit', v_tax)
      );
    end if;
  end if;
  if jsonb_array_length(v_journal_lines) >= 2 then
    perform private.post_journal(
      p_business_id, now(), 'Penjualan Tiket ' || v_invoice_number, 'penjualan', v_transaction_id, v_journal_lines
    );
  end if;

  return query select v_transaction_id, v_invoice_number;
end;
$$;

grant execute on function public.checkout_ticket_transaction(uuid, uuid, jsonb, text, numeric, uuid) to authenticated;
