-- Module: karyawan (employees) sebagai entitas terpisah dari kasir
-- (cashiers). Sebelumnya absensi & payroll dibaca langsung dari tabel
-- cashiers, jadi staf yang tidak pernah pegang kasir (mis. tukang masak,
-- cleaning service) terpaksa dibikinkan akun kasir palsu (PIN + role) cuma
-- supaya bisa dicatat absensi/gajinya. Sekarang employees berdiri sendiri;
-- cashier_id di employees cuma link opsional kalau orang itu juga pegang
-- kasir.

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  daily_rate numeric(12, 2) not null default 0,
  active boolean not null default true,
  note text,
  cashier_id uuid references public.cashiers (id) on delete set null,
  created_at timestamptz not null default now()
);

create index employees_business_id_idx on public.employees (business_id);
create unique index employees_cashier_id_key on public.employees (cashier_id) where cashier_id is not null;

alter table public.employees enable row level security;

create policy "Owner manages employees of own businesses"
on public.employees for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Backfill: satu employee per cashier yang sudah ada, supaya absensi/payroll
-- lama tetap tersambung ke seseorang setelah migrasi.
insert into public.employees (business_id, name, daily_rate, active, cashier_id)
select business_id, name, daily_rate, active, id
from public.cashiers;

-- attendance: pindah referensi dari cashier_id ke employee_id ---------------
alter table public.attendance add column employee_id uuid references public.employees (id) on delete cascade;

update public.attendance a
set employee_id = e.id
from public.employees e
where e.cashier_id = a.cashier_id;

alter table public.attendance alter column employee_id set not null;
alter table public.attendance drop constraint if exists attendance_cashier_id_date_key;
alter table public.attendance drop column cashier_id;
alter table public.attendance add constraint attendance_employee_id_date_key unique (employee_id, date);

-- payslips: pindah referensi dari cashier_id ke employee_id -----------------
alter table public.payslips add column employee_id uuid references public.employees (id);

update public.payslips p
set employee_id = e.id
from public.employees e
where e.cashier_id = p.cashier_id;

alter table public.payslips alter column employee_id set not null;
alter table public.payslips drop column cashier_id;

-- cashiers: gaji harian sepenuhnya pindah ke employees ----------------------
alter table public.cashiers drop column daily_rate;
