-- User minta kasbon bisa diinput dari Kas Kecil dengan tanggal manual --
-- sebelumnya dikunci ke "hari ini" (now()), padahal kasbon sering dicatat
-- telat dari kejadian aslinya. Ganti pendekatan "tambah kolom tanggal baru"
-- jadi cukup terima p_date opsional di post_petty_cash_kasbon, dan waktu
-- di-approve (review_shift_cash_movement), reklas ke 1-060 + baris
-- employee_advances-nya ikut pakai tanggal asli itu (dibaca balik dari
-- journal_entries.date milik posting awal), bukan tanggal approve --
-- supaya Buku Besar & rekap kasbon tetap akurat walau baru di-approve
-- beberapa hari kemudian.

drop function if exists public.post_petty_cash_kasbon(uuid, uuid, numeric, text);

create or replace function public.post_petty_cash_kasbon(
  p_business_id uuid,
  p_employee_id uuid,
  p_amount numeric,
  p_note text default null,
  p_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
  v_movement_id uuid;
  v_employee_name text;
  v_description text;
  v_lines jsonb;
  v_date date;
begin
  if not private.owns_business(p_business_id) then
    raise exception 'not authorized';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select name into v_employee_name
  from public.employees
  where id = p_employee_id and business_id = p_business_id;

  if not found then
    raise exception 'employee not found';
  end if;

  v_date := coalesce(p_date, (now() at time zone 'Asia/Jakarta')::date);
  if v_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'tanggal tidak boleh di masa depan';
  end if;

  v_description := 'Kasbon: ' || v_employee_name || coalesce(' — ' || nullif(trim(p_note), ''), '');

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', '1-050', 'debit', p_amount, 'credit', 0),
    jsonb_build_object('account_code', '1-001', 'debit', 0, 'credit', p_amount)
  );

  v_entry_id := private.post_journal(
    p_business_id, (v_date::text || ' 00:00:00+07')::timestamptz, v_description, 'kas_kecil', null, v_lines
  );

  insert into public.shift_cash_movements (
    business_id, shift_id, cashier_id, origin, direction, amount, category, description,
    status, journal_entry_id, created_by_user_id, employee_id
  ) values (
    p_business_id, null, null, 'admin', 'out', p_amount, 'Kasbon', v_description,
    'pending', v_entry_id, auth.uid(), p_employee_id
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

grant execute on function public.post_petty_cash_kasbon(uuid, uuid, numeric, text, date) to authenticated;

-- Sama seperti sebelumnya, tapi khusus kategori 'Kasbon': tanggal reklas ke
-- 1-060 dan baris employee_advances sekarang dibaca dari tanggal asli
-- transaksi (journal_entries.date milik posting awal ke 1-050), bukan
-- tanggal/waktu approve -- supaya kasbon yang baru di-approve beberapa hari
-- kemudian tetap tercatat di tanggal kejadian aslinya, bukan tanggal
-- approve-nya.
create or replace function public.review_shift_cash_movement(
  p_movement_id uuid,
  p_decision text,
  p_account_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movement record;
  v_entry_id uuid;
  v_lines jsonb;
  v_account_code text;
  v_original_date date;
begin
  select * into v_movement
  from public.shift_cash_movements
  where id = p_movement_id;

  if not found then
    raise exception 'movement not found';
  end if;

  if not private.owns_business(v_movement.business_id) then
    raise exception 'not authorized';
  end if;

  if v_movement.direction != 'out' then
    raise exception 'only kas keluar movements can be reviewed';
  end if;

  if v_movement.status != 'pending' then
    raise exception 'movement already reviewed';
  end if;

  if p_decision not in ('approve', 'reject') then
    raise exception 'invalid decision';
  end if;

  if p_decision = 'approve' then
    if v_movement.category = 'Kasbon' then
      v_account_code := '1-060';

      select je.date::date into v_original_date
      from public.journal_entries je
      where je.id = v_movement.journal_entry_id;
    else
      if p_account_code is null or length(trim(p_account_code)) = 0 then
        raise exception 'account_code required to approve';
      end if;
      v_account_code := p_account_code;
    end if;

    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_account_code, 'debit', v_movement.amount, 'credit', 0),
      jsonb_build_object('account_code', '1-050', 'debit', 0, 'credit', v_movement.amount)
    );

    v_entry_id := private.post_journal(
      v_movement.business_id,
      case when v_original_date is not null then (v_original_date::text || ' 00:00:00+07')::timestamptz else now() end,
      'Klasifikasi kas kecil: ' || v_movement.description,
      'kas_kecil', v_movement.id, v_lines
    );

    update public.shift_cash_movements
    set status = 'posted',
        account_code = v_account_code,
        reclass_journal_entry_id = v_entry_id,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_movement_id;

    if v_movement.category = 'Kasbon' and v_movement.employee_id is not null then
      insert into public.employee_advances (business_id, employee_id, date, amount, note)
      values (
        v_movement.business_id,
        v_movement.employee_id,
        coalesce(v_original_date, (v_movement.created_at at time zone 'Asia/Jakarta')::date),
        v_movement.amount,
        v_movement.description
      );
    end if;
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '1-001', 'debit', v_movement.amount, 'credit', 0),
      jsonb_build_object('account_code', '1-050', 'debit', 0, 'credit', v_movement.amount)
    );

    v_entry_id := private.post_journal(
      v_movement.business_id, now(),
      'Tolak kas kecil: ' || v_movement.description,
      'kas_kecil', v_movement.id, v_lines
    );

    update public.shift_cash_movements
    set status = 'rejected',
        reclass_journal_entry_id = v_entry_id,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_movement_id;
  end if;

  return v_entry_id;
end;
$$;

grant execute on function public.review_shift_cash_movement(uuid, text, text) to authenticated;
