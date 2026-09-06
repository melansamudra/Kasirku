-- review_shift_cash_movement sebelumnya cuma pakai tanggal transaksi asli
-- (journal_entries.date milik posting awal ke 1-050) buat kategori Kasbon
-- saja -- kategori lain (Bahan Baku/Bukan Bahan Baku/Lain-lain) selalu
-- posting reklas pakai now() (tanggal APPROVE), bukan tanggal nota aslinya.
-- Baru ketahuan pas ada backlog >100 nota Agustus yang telat direview
-- (gara-gara bug ambiguous FK embed di dashboard, lihat commit a180c3f) --
-- kalau di-approve sekarang, bebannya salah nyangkut ke September, padahal
-- kejadiannya Agustus. Sekarang SEMUA kategori ikut baca tanggal asli.
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

  select je.date::date into v_original_date
  from public.journal_entries je
  where je.id = v_movement.journal_entry_id;

  if p_decision = 'approve' then
    if v_movement.category = 'Kasbon' then
      v_account_code := '1-060';
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
      v_movement.business_id,
      case when v_original_date is not null then (v_original_date::text || ' 00:00:00+07')::timestamptz else now() end,
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
