-- Balikin open_shift() ke versi standar (sama seperti bisnis lain, mis.
-- Adi's Culinary): setiap kasir di tiap toko WAJIB input modal awal sendiri
-- lewat layar "Mulai Shift" -- tidak ada toko yang shift-nya kebuka otomatis
-- diam-diam dengan modal Rp0 gara-gara toko lain (mirror-toko) buka duluan.
-- Migration 20260908160000 menambahkan cascade itu supaya toggle mirror
-- tidak gagal kalau owner lupa buka shift di kedua toko -- tapi user memilih
-- konsistensi pengalaman kasir (selalu diminta modal, sama seperti kasir
-- toko lain) ketimbang kenyamanan itu. Kalau toko tujuan belum ada shift
-- terbuka saat transaksi mirror jalan, itu tetap gagal dengan pesan error
-- "no active shift" seperti sebelum migration itu ada -- owner buka manual.
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

  return v_shift_id;
end;
$$;

select pg_notify('pgrst', 'reload schema');
