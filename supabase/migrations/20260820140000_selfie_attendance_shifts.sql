-- Fitur absen selfie: karyawan buka link publik tanpa login, pilih nama,
-- ambil selfie buat absen masuk/pulang. Telat & lembur dihitung otomatis
-- dari jadwal shift yang di-assign admin per hari, admin tinggal
-- konfirmasi/verifikasi belakangan (bukan approval yang memblokir).

-- 1. Shift bernama (mis. "Shift Pagi" 07:00-15:00), di-assign per hari.
create table public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now()
);

create index shift_templates_business_id_idx on public.shift_templates (business_id);

alter table public.shift_templates enable row level security;

create policy "Owner manages shift templates of own businesses"
on public.shift_templates for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- 2. Assignment shift per karyawan per hari.
create table public.employee_shift_assignments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  date date not null,
  shift_template_id uuid not null references public.shift_templates (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (employee_id, date)
);

create index employee_shift_assignments_business_id_idx on public.employee_shift_assignments (business_id);
create index employee_shift_assignments_date_idx on public.employee_shift_assignments (date);

alter table public.employee_shift_assignments enable row level security;

create policy "Owner manages shift assignments of own businesses"
on public.employee_shift_assignments for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- 3. Token akses link absen selfie publik — sama pola dengan tables.qr_slug
-- (token acak, bukan dari nomor urut), tapi satu per bisnis (bukan per meja)
-- karena satu link/poster QR dipasang di lokasi, dipakai semua staf.
alter table public.businesses add column attendance_qr_slug text unique;

update public.businesses
set attendance_qr_slug = encode(extensions.gen_random_bytes(9), 'hex')
where attendance_qr_slug is null;

-- 4. Attendance: kolom buat absen selfie. "late" (boolean) yang sudah ada
-- tetap dipakai apa adanya oleh payroll (dihitung dari late_minutes > 0 saat
-- checkin), jadi logika potongan keterlambatan yang sudah ada tidak perlu
-- diubah. overtime_hours dipakai sebagai draft jam lembur di Rekap Payroll
-- (masih bisa diubah manual sebelum slip dibuat).
alter table public.attendance
  add column shift_template_id uuid references public.shift_templates (id) on delete set null,
  add column check_in_at timestamptz,
  add column check_in_photo_url text,
  add column check_out_at timestamptz,
  add column check_out_photo_url text,
  add column late_minutes int not null default 0,
  add column overtime_hours numeric(6, 2) not null default 0,
  add column verified_by_admin boolean not null default false,
  add column verified_at timestamptz;

-- 5. Storage bucket buat foto selfie absen. Publik-baca (sama pola dengan
-- bucket product-images yang sudah ada) — upload TIDAK lewat kredensial
-- anon langsung (staf tidak login), tapi lewat API route pakai service-role
-- client yang sudah validasi slug+employee dulu, jadi tidak perlu policy
-- insert untuk role anon di sini.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attendance-selfies', 'attendance-selfies', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Public read attendance selfies"
on storage.objects for select
using (bucket_id = 'attendance-selfies');

create policy "Owner deletes attendance selfies of own business"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'attendance-selfies'
  and private.owns_business((string_to_array(name, '/'))[1]::uuid)
);

-- 6. RPC buat halaman absen selfie publik baca nama toko + daftar karyawan
-- aktif tanpa login — pola sama persis dengan get_self_order_menu (security
-- definer, di-grant ke anon, business di-resolve dari slug DI DALAM fungsi,
-- bukan dipercaya dari client).
create or replace function public.get_attendance_checkin_info(p_slug text)
returns table (business_id uuid, business_name text, employee_id uuid, employee_name text)
language sql
security definer
set search_path = ''
as $$
  select b.id, b.name, e.id, e.name
  from public.businesses b
  join public.employees e on e.business_id = b.id and e.active = true
  where b.attendance_qr_slug = p_slug
  order by e.created_at asc;
$$;

grant execute on function public.get_attendance_checkin_info(text) to anon, authenticated;
