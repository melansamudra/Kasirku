-- PO Supplier MANUAL -- pasangan ke-4 dari Dokumen Manual (Surat
-- Jalan/Permintaan Barang/Stock Opname), dokumen bebas isi sendiri untuk
-- order ke supplier, TIDAK terhubung ke purchase_orders/PR/alokasi digital
-- sama sekali. Beda dari 3 dokumen lain: butuh nama supplier tujuan
-- (seperti destination di Surat Jalan) dan tanda tangan persetujuan
-- Owner/Finance, bukan staf operasional -- arahan user 2026-09-17.
-- location_id langsung dibuat nullable (bukan not null lalu di-drop
-- belakangan seperti 3 tabel lain) supaya toko standar tanpa
-- stock_locations langsung bisa pakai versi umum tanpa migration susulan.
create table public.manual_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  location_id uuid references public.stock_locations (id) on delete restrict,
  po_number text not null,
  supplier_name text not null,
  note text,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);

create table public.manual_purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  manual_purchase_order_id uuid not null references public.manual_purchase_orders (id) on delete cascade,
  item_name text not null,
  unit text,
  qty numeric(12, 2) not null,
  sort_order int not null default 0
);

create index manual_purchase_orders_business_id_idx on public.manual_purchase_orders (business_id);
create index manual_purchase_orders_location_id_idx on public.manual_purchase_orders (location_id);
create index manual_purchase_order_items_po_id_idx on public.manual_purchase_order_items (manual_purchase_order_id);

alter table public.manual_purchase_orders enable row level security;
alter table public.manual_purchase_order_items enable row level security;

create policy "Owner manages manual purchase orders of own businesses"
on public.manual_purchase_orders for all
using (private.owns_business(business_id)) with check (private.owns_business(business_id));

create policy "Owner manages manual purchase order items of own businesses"
on public.manual_purchase_order_items for all
using (private.owns_business(business_id)) with check (private.owns_business(business_id));
