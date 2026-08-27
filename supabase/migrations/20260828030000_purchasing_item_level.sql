-- Purchasing v2: gerbang budget opsional (saklar on/off, default OFF --
-- "saat ini budget belum dilakukan, klo sudah difungsikan baru dipakai") +
-- fulfillment per ITEM (ambil dari stok Gudang Utama, atau order ke
-- supplier) + approval budget pindah ke level item ("per item barang, PR
-- terkoreksi") -- lihat plan "Purchasing v2" utk detail alur lengkap.

-- Saklar on/off gerbang budget, default OFF (belum difungsikan)
alter table public.businesses
  add column procurement_budget_gate_enabled boolean not null default false;

-- Budget approval pindah ke level ITEM (bukan PR utuh)
alter table public.purchase_request_items
  add column budget_status text not null default 'pending'
    check (budget_status in ('pending', 'approved_in_budget', 'rejected')),
  add column budget_approved_by text,
  add column budget_approved_at timestamptz,
  add column budget_note text,
  add column fulfillment_source text not null default 'pending'
    check (fulfillment_source in ('pending', 'stock', 'supplier'));

-- Kolom budget_status dkk di purchase_requests (header, dari Fase 1) dilepas
-- -- source of truth sekarang di item, bukan header lagi.
alter table public.purchase_requests
  drop column if exists budget_status,
  drop column if exists budget_approved_by,
  drop column if exists budget_approved_at,
  drop column if exists budget_note;

-- "Ambil dari gudang": Purchasing menandai, lokasi peminta konfirmasi
-- terima -- stok BARU pindah saat received_at terisi (bukan saat marked_at).
create table public.purchase_request_item_stock_fulfillments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  purchase_request_item_id uuid not null references public.purchase_request_items (id) on delete cascade,
  source_location_id uuid not null references public.stock_locations (id) on delete restrict,
  qty numeric(12, 2) not null check (qty > 0),
  marked_by text,
  marked_at timestamptz not null default now(),
  received_by text,
  received_at timestamptz
);

create index purchase_request_item_stock_fulfillments_item_id_idx
  on public.purchase_request_item_stock_fulfillments (purchase_request_item_id);

alter table public.purchase_request_item_stock_fulfillments enable row level security;
create policy "Owner manages stock fulfillments of own businesses"
on public.purchase_request_item_stock_fulfillments for all
using (private.owns_business(business_id)) with check (private.owns_business(business_id));
