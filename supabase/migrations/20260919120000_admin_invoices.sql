-- Invoice Langganan: dokumen tagihan yang dibuat admin platform (bukan
-- pemilik bisnis) untuk menagih biaya langganan KasirKu ke sebuah bisnis
-- (mis. Mie Kota) selama BILLING_MANUAL_MODE masih aktif (belum ada VA
-- otomatis). Sengaja dipisah dari tabel invoices/invoice_lines yang sudah
-- ada -- itu punya arah sebaliknya (bisnis menagih ke KLIEN-nya sendiri),
-- kalau dipakai bersama akan tercampur di daftar invoice milik bisnis.
create table public.admin_invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  invoice_number text not null unique,
  date date not null default current_date,
  due_date date,
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  dp_amount numeric(14, 2) not null default 0 check (dp_amount >= 0 and dp_amount <= subtotal),
  status text not null default 'unpaid' check (status in ('draft', 'unpaid', 'partial', 'paid')),
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index admin_invoices_business_id_idx on public.admin_invoices (business_id, date desc);

alter table public.admin_invoices enable row level security;

-- Read-only untuk pemilik bisnis (supaya bisa lihat & cetak tagihannya
-- sendiri) -- create/update/delete cuma lewat service role dari panel admin
-- (lihat src/app/admin/invoices/actions.ts), sama pola dengan
-- subscriptions/payments di 20260712110000_billing.sql.
create policy "Owner reads own admin invoices"
on public.admin_invoices for select
using (private.owns_business(business_id));

create table public.admin_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.admin_invoices (id) on delete cascade,
  description text not null,
  qty numeric(12, 2) not null check (qty > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0)
);

create index admin_invoice_lines_invoice_id_idx on public.admin_invoice_lines (invoice_id);

alter table public.admin_invoice_lines enable row level security;

create policy "Owner reads own admin invoice lines"
on public.admin_invoice_lines for select
using (
  exists (
    select 1 from public.admin_invoices i
    where i.id = admin_invoice_lines.invoice_id
      and private.owns_business(i.business_id)
  )
);
