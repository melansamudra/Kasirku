-- Kasbon karyawan lewat Kas Kecil: sebelumnya "+ Kasbon" di halaman Payroll
-- cuma catatan (employee_advances), tidak pernah menyentuh kas/jurnal sama
-- sekali -- padahal secara fisik uangnya keluar dari petty cash kasir saat
-- itu juga. Sekarang kasbon bisa dicatat dari halaman Kas Kecil (form yang
-- sama dengan Nota Tunai/Nota Hutang, karena kasir yang pegang petty cash
-- yang input), lewat jalur suspense 1-050 yang sama supaya rekonsiliasi kas
-- tetap akurat -- tapi BEDA dari nota tunai biasa: saat disetujui, direklas
-- ke akun aset baru "Piutang Karyawan" (bukan akun beban pilihan bebas
-- admin), karena ini piutang yang akan ditagih balik lewat potongan gaji,
-- bukan pengeluaran. Approve juga otomatis mencatat baris employee_advances
-- supaya langsung kebaca di perhitungan sisa kasbon Payroll
-- (getOutstandingKasbon di payroll/actions.ts) tanpa perlu dicatat dobel.

create or replace function private.seed_default_accounts(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accounts (business_id, code, name, type, normal_balance, is_system)
  values
    (p_business_id, '1-001', 'Kas & Bank', 'aset', 'debit', true),
    (p_business_id, '1-050', 'Kas Kecil Menunggu Klasifikasi', 'aset', 'debit', true),
    (p_business_id, '1-060', 'Piutang Karyawan', 'aset', 'debit', true),
    (p_business_id, '1-100', 'Piutang Usaha', 'aset', 'debit', true),
    (p_business_id, '1-200', 'Persediaan', 'aset', 'debit', true),
    (p_business_id, '1-500', 'Peralatan', 'aset', 'debit', true),
    (p_business_id, '1-501', 'Akumulasi Penyusutan', 'aset', 'debit', true),
    (p_business_id, '2-001', 'Utang Dagang', 'kewajiban', 'kredit', true),
    (p_business_id, '2-100', 'Utang Gaji', 'kewajiban', 'kredit', true),
    (p_business_id, '2-200', 'PPN Keluaran (Utang Pajak)', 'kewajiban', 'kredit', true),
    (p_business_id, '3-001', 'Modal Pemilik', 'modal', 'kredit', true),
    (p_business_id, '3-100', 'Laba Ditahan', 'modal', 'kredit', true),
    (p_business_id, '4-001', 'Pendapatan Penjualan', 'pendapatan', 'kredit', true),
    (p_business_id, '4-002', 'Pendapatan Tiket', 'pendapatan', 'kredit', true),
    (p_business_id, '4-999', 'Pendapatan Lain-lain', 'pendapatan', 'kredit', true),
    (p_business_id, '5-001', 'Beban Pokok Penjualan (HPP)', 'beban', 'debit', true),
    (p_business_id, '5-100', 'Beban Gaji', 'beban', 'debit', true),
    (p_business_id, '5-101', 'Beban Listrik & Air', 'beban', 'debit', true),
    (p_business_id, '5-102', 'Beban Sewa', 'beban', 'debit', true),
    (p_business_id, '5-103', 'Beban Marketing', 'beban', 'debit', true),
    (p_business_id, '5-104', 'Beban Perlengkapan', 'beban', 'debit', true),
    (p_business_id, '5-105', 'Beban Penyusutan', 'beban', 'debit', true),
    (p_business_id, '5-999', 'Beban Lain-lain', 'beban', 'debit', true)
  on conflict (business_id, code) do nothing;
end;
$$;

-- Backfill: business yang sudah ada belum punya 1-060.
do $$
declare
  v_business record;
begin
  for v_business in select id from public.businesses loop
    perform private.seed_default_accounts(v_business.id);
  end loop;
end $$;

alter table public.shift_cash_movements
  add column employee_id uuid references public.employees (id) on delete set null;

create index shift_cash_movements_employee_id_idx on public.shift_cash_movements (employee_id);

-- Input kasbon dari Kas Kecil (kasir/admin yang pegang petty cash). Sama
-- persis pola post_petty_cash_expense (posting awal ke suspense 1-050),
-- bedanya category dipatok 'Kasbon' dan employee_id wajib diisi.
create or replace function public.post_petty_cash_kasbon(
  p_business_id uuid,
  p_employee_id uuid,
  p_amount numeric,
  p_note text default null
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

  v_description := 'Kasbon: ' || v_employee_name || coalesce(' — ' || nullif(trim(p_note), ''), '');

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', '1-050', 'debit', p_amount, 'credit', 0),
    jsonb_build_object('account_code', '1-001', 'debit', 0, 'credit', p_amount)
  );

  v_entry_id := private.post_journal(
    p_business_id, now(), v_description, 'kas_kecil', null, v_lines
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

grant execute on function public.post_petty_cash_kasbon(uuid, uuid, numeric, text) to authenticated;

-- Sama seperti sebelumnya, tapi kategori 'Kasbon' sekarang punya jalur
-- sendiri saat approve: akun reklas dipaksa ke '1-060 Piutang Karyawan'
-- (mengabaikan p_account_code dari client -- kasbon bukan pilihan bebas
-- admin seperti kategori lain), dan otomatis menambah baris
-- employee_advances supaya langsung kebaca di perhitungan sisa kasbon
-- Payroll tanpa perlu dicatat manual dobel di sana.
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
      v_movement.business_id, now(),
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
        (v_movement.created_at at time zone 'Asia/Jakarta')::date,
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
