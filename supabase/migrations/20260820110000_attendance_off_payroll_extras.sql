-- 1. Absensi: tambah status "Off" (hari libur terjadwal) di samping
-- hadir/izin/sakit/alpa yang sudah ada.
alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance add constraint attendance_status_check
  check (status in ('hadir', 'izin', 'sakit', 'alpa', 'off'));

-- 2. Karyawan: tipe gaji harian (dikali hari hadir) atau bulanan (flat per
-- periode slip). daily_rate tetap dipakai untuk harian; monthly_rate baru
-- dipakai untuk bulanan.
alter table public.employees
  add column salary_type text not null default 'harian' check (salary_type in ('harian', 'bulanan')),
  add column monthly_rate numeric(12, 2) not null default 0;

-- 3. Payslip: snapshot tipe gaji (sama alasannya dengan daily_rate/hadir_count
-- yang sudah di-snapshot — supaya slip lama tidak berubah kalau karyawan
-- gonta-ganti tipe gaji belakangan), plus dua potongan baru dengan pola yang
-- sama seperti lembur_amount/thr_amount yang sudah ada (nominal final,
-- dihitung di form sebelum submit — bukan raw menit/jam yang disimpan).
alter table public.payslips
  add column salary_type text not null default 'harian',
  add column monthly_rate numeric(12, 2) not null default 0,
  add column off_count int not null default 0,
  add column late_deduction numeric(12, 2) not null default 0,
  add column kasbon_deduction numeric(12, 2) not null default 0;

-- 4. Kasbon: ledger pemberian kasbon per karyawan. Sisa kasbon dihitung di
-- aplikasi sebagai SUM(amount) dikurangi SUM(kasbon_deduction) dari
-- payslips yang sudah dibayar milik karyawan itu — bukan lewat kolom
-- "settled" terpisah, supaya kasbon yang dipotong di slip yang masih bisa
-- diedit/dihapus belum dianggap lunas.
create table public.employee_advances (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);

create index employee_advances_business_id_idx on public.employee_advances (business_id);
create index employee_advances_employee_id_idx on public.employee_advances (employee_id);

alter table public.employee_advances enable row level security;

create policy "Owner manages employee advances of own businesses"
on public.employee_advances for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
