-- Saat shift dibuka untuk sebuah bisnis yang punya link mirror-toko aktif
-- (transaction_mirror_links.from_business_id), otomatis bukakan juga shift
-- di toko tujuan kalau di sana belum ada shift yang terbuka -- supaya
-- toggle "Kirim ke Toko Lain" tidak gagal dengan error "no active shift"
-- gara-gara owner lupa buka shift manual di kedua toko.
--
-- Opening cash toko tujuan di-set 0 (bukan ikut nilai toko sumber, karena
-- laci kas fisiknya beda) -- owner tetap bisa lihat/koreksi nanti di
-- halaman shift toko tujuan kalau perlu. Tidak simetris ke close_shift:
-- menutup shift sumber TIDAK ikut menutup shift tujuan (dibiarkan manual,
-- karena toko tujuan bisa saja masih melayani transaksi langsungnya
-- sendiri sampai jam tutup yang berbeda).
create or replace function public.open_shift(
  p_business_id uuid,
  p_cashier_id uuid,
  p_opening_cash numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift_id uuid;
  v_link record;
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

  if exists (
    select 1 from public.shifts s
    where s.business_id = p_business_id and s.closed_at is null
  ) then
    raise exception 'a shift is already open for this business';
  end if;

  if p_opening_cash is null or p_opening_cash < 0 then
    raise exception 'invalid opening cash';
  end if;

  insert into public.shifts (business_id, cashier_id, opening_cash, notes)
  values (p_business_id, p_cashier_id, p_opening_cash, p_notes)
  returning id into v_shift_id;

  select l.to_business_id, l.to_cashier_id
  into v_link
  from public.transaction_mirror_links l
  where l.from_business_id = p_business_id and l.active
  limit 1;

  if v_link.to_business_id is not null then
    if not exists (
      select 1 from public.shifts s
      where s.business_id = v_link.to_business_id and s.closed_at is null
    ) then
      insert into public.shifts (business_id, cashier_id, opening_cash, notes)
      values (v_link.to_business_id, v_link.to_cashier_id, 0, 'Dibuka otomatis bersamaan dengan shift toko sumber (mirror-toko)');
    end if;
  end if;

  return v_shift_id;
end;
$$;

select pg_notify('pgrst', 'reload schema');
