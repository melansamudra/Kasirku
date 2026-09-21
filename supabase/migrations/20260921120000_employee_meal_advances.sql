-- Uang Makan Bulanan -- jatah tunai (nominalnya dari
-- employee_recurring_allowances berlabel "Tunjangan Makan") yang kadang
-- diambil tunai di tengah bulan alih-alih ditunggu sampai gajian. BEDA dari
-- Kasbon (employee_advances): ini bukan pinjaman/piutang, jadi begitu
-- diambil langsung diposting sebagai Beban Gaji (bukan suspense/piutang).
-- Sisa jatah yang belum diambil di akhir periode otomatis ditambahkan ke
-- baris "Tunjangan Makan" di slip gaji (lihat createPayslip di
-- payroll/actions.ts) -- supaya totalnya pas sesuai nominal Tunjangan Tetap,
-- bukan dobel bayar.
create table public.employee_meal_advances (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  journal_entry_id uuid references public.journal_entries (id) on delete set null,
  created_at timestamptz not null default now()
);

create index employee_meal_advances_business_id_idx on public.employee_meal_advances (business_id);
create index employee_meal_advances_employee_id_idx on public.employee_meal_advances (employee_id);

alter table public.employee_meal_advances enable row level security;

create policy "Owner manages employee meal advances of own businesses"
on public.employee_meal_advances for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
