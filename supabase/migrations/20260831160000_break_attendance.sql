-- Toggle absen istirahat (mulai/selesai) di halaman Absen Selfie publik --
-- khusus Llauk Nusantara dulu (staf sering istirahat lama tanpa tercatat,
-- request user 2026-08-31), bisnis lain tidak melihat toggle ini sama
-- sekali. Sengaja TIDAK pakai foto selfie (beda dengan Absen Masuk/Pulang)
-- -- cuma toggle kecil buat catat jam mulai/selesai istirahat.
alter table public.businesses
  add column break_attendance_enabled boolean not null default false;

update public.businesses
set break_attendance_enabled = true
where id = 'f7c0509b-d708-45d5-9245-592e50f7cbbe';

alter table public.attendance
  add column break_start_at timestamptz,
  add column break_end_at timestamptz;

drop function if exists public.get_attendance_checkin_info(text);

create function public.get_attendance_checkin_info(p_slug text)
returns table (
  business_id uuid,
  business_name text,
  employee_id uuid,
  employee_name text,
  break_attendance_enabled boolean
)
language sql
security definer
set search_path = ''
as $$
  select b.id, b.name, e.id, e.name, b.break_attendance_enabled
  from public.businesses b
  join public.employees e on e.business_id = b.id and e.active = true
  where b.attendance_qr_slug = p_slug
  order by e.created_at asc;
$$;

grant execute on function public.get_attendance_checkin_info(text) to anon, authenticated;
