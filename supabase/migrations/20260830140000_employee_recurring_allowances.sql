-- Tunjangan Tetap -- template tunjangan berulang per karyawan (bisa lebih
-- dari satu, mis. Tunjangan Jabatan + Tunjangan Kesehatan + Bonus Bulanan
-- sekaligus). Dikelola dari halaman Karyawan (tambah/edit/hapus/nonaktifkan),
-- lalu OTOMATIS disalin jadi payslip_adjustments setiap kali slip gaji baru
-- dibuat (lihat createPayslip) -- supaya tidak perlu diketik ulang tiap
-- bulan. `active = false` = tidak ikut disalin ke slip berikutnya, tapi
-- template-nya tetap tersimpan (bisa diaktifkan lagi kapan saja). Mengubah
-- template TIDAK mengubah slip yang sudah dibuat -- itu snapshot lepas di
-- payslip_adjustments begitu disalin.
create table public.employee_recurring_allowances (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  label text not null,
  amount numeric(12, 2) not null check (amount > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index employee_recurring_allowances_business_id_idx on public.employee_recurring_allowances (business_id);
create index employee_recurring_allowances_employee_id_idx on public.employee_recurring_allowances (employee_id);

alter table public.employee_recurring_allowances enable row level security;

create policy "Owner manages employee recurring allowances of own businesses"
on public.employee_recurring_allowances for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
