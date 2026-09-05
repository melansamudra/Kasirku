-- Kasbon lewat link publik (business-wide, tanpa login/PIN) -- pola sama
-- dengan /absen (staf pilih nama sendiri dari daftar, tidak ada verifikasi
-- identitas lebih ketat) karena user minta "kaya absen, nanti tinggal
-- disetujui atau enggaknya". BEDA dari Kas Kecil Portal Lokasi
-- (20260831120000) yang pakai PIN -- kasbon sengaja dibikin lebih longgar
-- di sisi input karena tetap ada gerbang approval sebelum uangnya
-- benar-benar diakui (sama seperti Kasbon yang diinput admin dari dashboard,
-- lihat post_petty_cash_kasbon: dua-duanya cuma bikin baris 'pending' di
-- shift_cash_movements, direview di halaman Kas Kecil lewat
-- review_shift_cash_movement yang SUDAH otomatis reklas ke 1-060 Piutang
-- Karyawan kalau category='Kasbon' -- tidak perlu ubah apa pun di sisi
-- approval).
alter table public.businesses add column kasbon_slug text unique;

create or replace function public.get_kasbon_submit_info(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business record;
  v_employees jsonb;
begin
  select id, name into v_business
  from public.businesses
  where kasbon_slug = p_slug;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name) order by e.name asc),
    '[]'::jsonb
  )
  into v_employees
  from public.employees e
  where e.business_id = v_business.id and e.active = true;

  return jsonb_build_object(
    'business_id', v_business.id,
    'business_name', v_business.name,
    'employees', v_employees
  );
end;
$$;

grant execute on function public.get_kasbon_submit_info(text) to anon, authenticated;

-- Sama persis pola post_petty_cash_kasbon (dashboard, butuh owns_business),
-- cuma business_id-nya dicari lewat slug publik, bukan dari sesi admin yang
-- login -- makanya perlu fungsi terpisah, bukan reuse langsung.
create or replace function public.submit_petty_cash_kasbon_public(
  p_slug text,
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
  v_business_id uuid;
  v_employee_name text;
  v_entry_id uuid;
  v_movement_id uuid;
  v_description text;
  v_lines jsonb;
  v_date date;
begin
  select id into v_business_id from public.businesses where kasbon_slug = p_slug;
  if v_business_id is null then
    raise exception 'business not found';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select name into v_employee_name
  from public.employees
  where id = p_employee_id and business_id = v_business_id and active = true;
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
    v_business_id, (v_date::text || ' 00:00:00+07')::timestamptz, v_description, 'kas_kecil', null, v_lines
  );

  insert into public.shift_cash_movements (
    business_id, shift_id, cashier_id, origin, direction, amount, category, description,
    status, journal_entry_id, employee_id, created_by_employee_id, created_by_employee_name
  ) values (
    v_business_id, null, null, 'admin', 'out', p_amount, 'Kasbon', v_description,
    'pending', v_entry_id, p_employee_id, p_employee_id, v_employee_name
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

grant execute on function public.submit_petty_cash_kasbon_public(text, uuid, numeric, text, date) to anon, authenticated;
