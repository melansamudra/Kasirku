-- Adds a "paid" state to payslips so payroll can auto-post a journal entry
-- once, locking in base_pay + tunjangan - potongan at that point in time.
alter table public.payslips
  add column if not exists paid_at timestamptz;
