-- Pasangan dari `manual_delivery_notes` (Surat Jalan manual, 20260830180000) --
-- Permintaan Barang manual & Stock Opname manual, dokumen bebas isi sendiri
-- yang sama sekali TIDAK terhubung ke fitur digital yang sudah ada
-- (purchase_requests/alokasi/budget-gate untuk PR, ingredient_location_stock
-- untuk opname). Dipakai sebagai jalur cadangan selama alur digital berlapis
-- itu belum terbukti jalan mulus untuk operasional harian sungguhan (arahan
-- user 2026-08-31) -- murni dokumen/catatan, tidak memindahkan stok atau
-- memicu approval apa pun.
create table public.manual_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  location_id uuid not null references public.stock_locations (id) on delete restrict,
  pr_number text not null,
  note text,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);

create table public.manual_purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  manual_purchase_request_id uuid not null references public.manual_purchase_requests (id) on delete cascade,
  item_name text not null,
  unit text,
  qty numeric(12, 2) not null,
  sort_order int not null default 0
);

create table public.manual_stock_opnames (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  location_id uuid not null references public.stock_locations (id) on delete restrict,
  opname_number text not null,
  note text,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);

create table public.manual_stock_opname_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  manual_stock_opname_id uuid not null references public.manual_stock_opnames (id) on delete cascade,
  item_name text not null,
  unit text,
  qty numeric(12, 2) not null,
  sort_order int not null default 0
);

create index manual_purchase_requests_business_id_idx on public.manual_purchase_requests (business_id);
create index manual_purchase_requests_location_id_idx on public.manual_purchase_requests (location_id);
create index manual_purchase_request_items_pr_id_idx on public.manual_purchase_request_items (manual_purchase_request_id);

create index manual_stock_opnames_business_id_idx on public.manual_stock_opnames (business_id);
create index manual_stock_opnames_location_id_idx on public.manual_stock_opnames (location_id);
create index manual_stock_opname_items_opname_id_idx on public.manual_stock_opname_items (manual_stock_opname_id);

alter table public.manual_purchase_requests enable row level security;
alter table public.manual_purchase_request_items enable row level security;
alter table public.manual_stock_opnames enable row level security;
alter table public.manual_stock_opname_items enable row level security;

create policy "Owner manages manual purchase requests of own businesses"
on public.manual_purchase_requests for all
using (private.owns_business(business_id)) with check (private.owns_business(business_id));

create policy "Owner manages manual purchase request items of own businesses"
on public.manual_purchase_request_items for all
using (private.owns_business(business_id)) with check (private.owns_business(business_id));

create policy "Owner manages manual stock opnames of own businesses"
on public.manual_stock_opnames for all
using (private.owns_business(business_id)) with check (private.owns_business(business_id));

create policy "Owner manages manual stock opname items of own businesses"
on public.manual_stock_opname_items for all
using (private.owns_business(business_id)) with check (private.owns_business(business_id));
