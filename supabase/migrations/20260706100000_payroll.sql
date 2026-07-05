-- Module: payroll — daily-rate salary per cashier, manual attendance
-- tracking (owner/manager marks hadir/izin/sakit/alpa per day, independent
-- of POS shifts), and payslips generated from an attendance period plus
-- freeform allowance/deduction adjustments.

alter table public.cashiers
  add column if not exists daily_rate numeric(12, 2) not null default 0;

-- Attendance -----------------------------------------------------------

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  cashier_id uuid not null references public.cashiers (id) on delete cascade,
  date date not null,
  status text not null check (status in ('hadir', 'izin', 'sakit', 'alpa')),
  note text,
  created_at timestamptz not null default now(),
  unique (cashier_id, date)
);

create index attendance_business_id_date_idx on public.attendance (business_id, date);

alter table public.attendance enable row level security;

create policy "Owner manages attendance of own businesses"
on public.attendance for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Payslips ---------------------------------------------------------------
-- hadir/izin/sakit/alpa counts and daily_rate are snapshotted at creation
-- time so a payslip never silently changes if attendance is edited later.

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  cashier_id uuid not null references public.cashiers (id),
  period_start date not null,
  period_end date not null,
  daily_rate numeric(12, 2) not null,
  hadir_count int not null default 0,
  izin_count int not null default 0,
  sakit_count int not null default 0,
  alpa_count int not null default 0,
  base_pay numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index payslips_business_id_idx on public.payslips (business_id, created_at);

alter table public.payslips enable row level security;

create policy "Owner manages payslips of own businesses"
on public.payslips for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Payslip adjustments ------------------------------------------------------
-- Freeform allowances (tunjangan) and deductions (potongan); unlike the
-- base_pay snapshot these can keep being added after the payslip exists.

create table public.payslip_adjustments (
  id uuid primary key default gen_random_uuid(),
  payslip_id uuid not null references public.payslips (id) on delete cascade,
  type text not null check (type in ('tunjangan', 'potongan')),
  label text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create index payslip_adjustments_payslip_id_idx on public.payslip_adjustments (payslip_id);

alter table public.payslip_adjustments enable row level security;

create policy "Owner manages payslip adjustments of own businesses"
on public.payslip_adjustments for all
using (
  exists (
    select 1 from public.payslips p
    where p.id = payslip_adjustments.payslip_id
      and private.owns_business(p.business_id)
  )
)
with check (
  exists (
    select 1 from public.payslips p
    where p.id = payslip_adjustments.payslip_id
      and private.owns_business(p.business_id)
  )
);
