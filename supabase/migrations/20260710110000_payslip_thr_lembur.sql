-- Gives THR and Lembur their own first-class fields on payslips instead of
-- being entered as generic tunjangan rows, so they're distinguishable in
-- future reporting.
alter table public.payslips
  add column if not exists lembur_amount numeric not null default 0,
  add column if not exists thr_amount numeric not null default 0;
