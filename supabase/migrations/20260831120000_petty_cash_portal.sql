-- Kas Kecil lewat Portal Lokasi (scan QR, tanpa login dashboard) -- khusus
-- lokasi Purchasing/Gudang Utama, khusus "Nota Tunai" (pengeluaran) saja.
-- Nota Hutang & Kasbon TETAP lewat dashboard (butuh pilih supplier/debitur,
-- kurang cocok buat scan cepat). Arahan user 2026-08-31: staf Purchasing/
-- stock keeper perlu cara cepat catat pengeluaran tunai tanpa login akun.
--
-- Identitas pencatat pakai PIN Portal Lokasi (employees.pin_hash, sesi
-- verifikasi sama seperti Produksi/Kirim/Terima) -- BUKAN dropdown nama
-- bebas tanpa verifikasi (pola lama Stok Opname/Terima Barang). Ini uang,
-- bukan cuma stok fisik, jadi dipilih level identitas yang lebih kuat.
--
-- `employees.id` BUKAN `auth.users.id` (beda konsep akun sama sekali, lihat
-- catatan project-llauk-cost-control-locations), jadi tidak bisa dipaksa ke
-- `created_by_user_id` yang ada (FK ke auth.users) -- kolom baru terpisah.
alter table public.shift_cash_movements
  add column created_by_employee_id uuid references public.employees (id) on delete set null,
  add column created_by_employee_name text;

create or replace function public.submit_petty_cash_expense_public(
  p_slug text,
  p_employee_id uuid,
  p_amount numeric,
  p_category text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_employee record;
  v_movement_id uuid;
  v_entry_id uuid;
  v_lines jsonb;
begin
  -- is_default_purchase=true di WHERE-nya sendiri (bukan cuma dicek belakangan)
  -- -- portal_slug lokasi LAIN (Dapur Produksi/Kitchen/Bar) tidak akan pernah
  -- match, jadi RPC ini murni tidak bisa dipanggil lewat slug lokasi lain.
  select business_id into v_business_id
  from public.stock_locations
  where portal_slug = p_slug and is_default_purchase = true;
  if v_business_id is null then
    raise exception 'business not found';
  end if;

  select id, name into v_employee
  from public.employees
  where id = p_employee_id and business_id = v_business_id and active = true;
  if not found then
    raise exception 'employee not found';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  if p_description is null or length(trim(p_description)) = 0 then
    raise exception 'description required';
  end if;

  -- Sama persis alur post_petty_cash_expense (dashboard) -- posting ke
  -- suspense (1-050) dulu, admin reklas ke akun beban final saat approve.
  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', '1-050', 'debit', p_amount, 'credit', 0),
    jsonb_build_object('account_code', '1-001', 'debit', 0, 'credit', p_amount)
  );

  v_entry_id := private.post_journal(v_business_id, now(), trim(p_description), 'kas_kecil', null, v_lines);

  insert into public.shift_cash_movements (
    business_id, shift_id, cashier_id, origin, direction, amount, category, description,
    status, journal_entry_id, created_by_employee_id, created_by_employee_name
  ) values (
    v_business_id, null, null, 'admin', 'out', p_amount, p_category, trim(p_description),
    'pending', v_entry_id, v_employee.id, v_employee.name
  )
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

grant execute on function public.submit_petty_cash_expense_public(text, uuid, numeric, text, text) to anon, authenticated;
