-- Tambah "divisi" (employees.note) ke get_attendance_checkin_info supaya
-- halaman Absen Selfie publik bisa minta pilih Divisi dulu baru nama --
-- daftar nama sudah 46 orang (lihat migration 20260831170000 & import data
-- karyawan 2026-08-31), scroll satu daftar panjang lambat & rawan salah
-- pilih orang.
drop function if exists public.get_attendance_checkin_info(text);

create function public.get_attendance_checkin_info(p_slug text)
returns table (
  business_id uuid,
  business_name text,
  employee_id uuid,
  employee_name text,
  break_attendance_enabled boolean,
  divisi text
)
language sql
security definer
set search_path = ''
as $$
  select b.id, b.name, e.id, e.name, b.break_attendance_enabled, e.note
  from public.businesses b
  join public.employees e on e.business_id = b.id and e.active = true and e.deleted_at is null
  where b.attendance_qr_slug = p_slug
  order by e.created_at asc;
$$;

grant execute on function public.get_attendance_checkin_info(text) to anon, authenticated;
