-- Kasbon selama ini SELALU disetujui penuh sesuai jumlah pengajuan -- tidak
-- ada cara admin menyetujui sebagian (mis. karyawan minta Rp100rb, admin cuma
-- mau kasih Rp50rb). Sekarang khusus kategori Kasbon, admin bisa masukkan
-- p_approved_amount yang beda dari jumlah pengajuan. Selisihnya dianggap uang
-- yang belum sempat diserahkan ke karyawan (uangnya masih di kas), jadi
-- dikembalikan ke 1-001 -- BUKAN jadi piutang maupun beban.
--
-- Perlu drop dulu: menambah parameter baru lewat CREATE OR REPLACE membuat
-- Postgres menganggapnya function overload baru (signature beda jumlah
-- argumen), bukan menggantikan yang lama -- bisa bikin panggilan RPC lama
-- ambigu.
drop function if exists public.review_shift_cash_movement(uuid, text, text);

alter table public.shift_cash_movements
  add column approved_amount numeric;

create or replace function public.review_shift_cash_movement(
  p_movement_id uuid,
  p_decision text,
  p_account_code text default null,
  p_approved_amount numeric default null
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
  v_approved_amount numeric;
  v_leftover numeric;
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
      v_approved_amount := coalesce(p_approved_amount, v_movement.amount);
      if v_approved_amount <= 0 or v_approved_amount > v_movement.amount then
        raise exception 'approved amount must be greater than 0 and not exceed the requested amount';
      end if;
    else
      if p_account_code is null or length(trim(p_account_code)) = 0 then
        raise exception 'account_code required to approve';
      end if;
      v_account_code := p_account_code;
      v_approved_amount := v_movement.amount;
    end if;

    v_leftover := v_movement.amount - v_approved_amount;

    if v_leftover > 0 then
      -- Kasbon disetujui sebagian: sisa yang tidak disetujui balik ke kas.
      v_lines := jsonb_build_array(
        jsonb_build_object('account_code', v_account_code, 'debit', v_approved_amount, 'credit', 0),
        jsonb_build_object('account_code', '1-001', 'debit', v_leftover, 'credit', 0),
        jsonb_build_object('account_code', '1-050', 'debit', 0, 'credit', v_movement.amount)
      );
    else
      v_lines := jsonb_build_array(
        jsonb_build_object('account_code', v_account_code, 'debit', v_movement.amount, 'credit', 0),
        jsonb_build_object('account_code', '1-050', 'debit', 0, 'credit', v_movement.amount)
      );
    end if;

    v_entry_id := private.post_journal(
      v_movement.business_id,
      case when v_original_date is not null then (v_original_date::text || ' 00:00:00+07')::timestamptz else now() end,
      'Klasifikasi kas kecil: ' || v_movement.description,
      'kas_kecil', v_movement.id, v_lines
    );

    update public.shift_cash_movements
    set status = 'posted',
        account_code = v_account_code,
        approved_amount = v_approved_amount,
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
        v_approved_amount,
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

grant execute on function public.review_shift_cash_movement(uuid, text, text, numeric) to authenticated;
