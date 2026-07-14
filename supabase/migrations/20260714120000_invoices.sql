-- Invoice/Nota: a pure document tool for billing clients (own name, line
-- items, DP, due date, print) — deliberately does NOT auto-post to the
-- journal (see [[finance-standalone-product]] decision), unlike purchases/
-- transactions which do. customer_id is an optional link to an existing
-- customer record; customer_name is always stored directly so invoices can
-- be billed to one-off clients without first creating a customer record.

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  customer_name text not null,
  invoice_number text not null,
  date date not null default current_date,
  due_date date,
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  dp_amount numeric(14, 2) not null default 0 check (dp_amount >= 0 and dp_amount <= subtotal),
  status text not null default 'unpaid' check (status in ('draft', 'unpaid', 'partial', 'paid')),
  note text,
  created_at timestamptz not null default now()
);

create unique index invoices_business_id_invoice_number_key
  on public.invoices (business_id, invoice_number);
create index invoices_business_id_idx on public.invoices (business_id, date desc);
create index invoices_customer_id_idx on public.invoices (customer_id);

alter table public.invoices enable row level security;

create policy "Owner manages invoices of own businesses"
on public.invoices for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  description text not null,
  qty numeric(12, 2) not null check (qty > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0)
);

create index invoice_lines_invoice_id_idx on public.invoice_lines (invoice_id);

alter table public.invoice_lines enable row level security;

create policy "Owner manages invoice lines of own businesses"
on public.invoice_lines for all
using (
  exists (
    select 1 from public.invoices i
    where i.id = invoice_lines.invoice_id
      and private.owns_business(i.business_id)
  )
)
with check (
  exists (
    select 1 from public.invoices i
    where i.id = invoice_lines.invoice_id
      and private.owns_business(i.business_id)
  )
);
