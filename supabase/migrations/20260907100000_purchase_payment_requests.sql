-- Pengajuan Pembayaran Hutang: staf ajukan rencana bayar hutang dagang ke
-- supplier (dari satu baris `purchases` yang masih ada sisa) -> owner harus
-- setuju dulu di app sebelum pembayaran beneran tercatat (posting jurnal +
-- update purchases.paid_amount baru terjadi saat approve, bukan saat
-- pengajuan dibuat). Meniru status-machine supplier_debt_notes
-- (pending -> verified) dan pola approval purchase_orders (issued_by/
-- approved_by + race-safe update lewat .eq("status", "pending") di klausa
-- UPDATE), tapi approve di sini sengaja OWNER-ONLY (bukan permission
-- delegable seperti canApprovePo) -- arahan user 2026-09-07.
create table public.purchase_payment_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('tunai', 'transfer')),
  note text,
  requested_by_user_id uuid not null,
  requested_by_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by_user_id uuid,
  approved_by_name text,
  approved_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now()
);

create index purchase_payment_requests_business_status_idx
  on public.purchase_payment_requests (business_id, status, created_at desc);
create index purchase_payment_requests_purchase_id_idx
  on public.purchase_payment_requests (purchase_id);

alter table public.purchase_payment_requests enable row level security;

create policy "Owner/staff manage payment requests of own businesses"
on public.purchase_payment_requests for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
