-- Surat Jalan (delivery note) -- dokumen fisik yang menyertai barang keluar
-- dari Gudang Utama ke lokasi peminta. Granularitasnya "1 batch barang yang
-- siap dikirim saat itu = 1 Surat Jalan", BUKAN 1 per PR atau 1 per barang --
-- barang dalam 1 PR bisa disiapkan bertahap (yang sudah ada di stok Gudang
-- duluan, yang masih dibeli dari supplier menyusul begitu GRN-nya beres),
-- jadi 1 PR wajar punya lebih dari 1 Surat Jalan. Murni paper-trail --
-- TIDAK memindahkan stok apa pun (jalur "Ambil dari Gudang" tetap lewat
-- receiveStockFulfillment yang sudah ada, jalur supplier sudah kekredit ke
-- lokasi peminta saat "Catat Pembelian").
--
-- source_type+source_id menunjuk balik ke baris asal barangnya:
-- 'stock_fulfillment' -> purchase_request_item_stock_fulfillments.id
-- 'grn_item'           -> goods_receipt_note_items.id
-- unique(source_type, source_id) mencegah 1 barang yang sama ikut ke lebih
-- dari 1 Surat Jalan.

create table public.delivery_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  purchase_request_id uuid not null references public.purchase_requests (id) on delete cascade,
  dn_number text not null,
  from_location_id uuid not null references public.stock_locations (id) on delete restrict,
  to_location_name text not null,
  to_location_id uuid references public.stock_locations (id) on delete set null,
  prepared_by text not null,
  note text,
  created_at timestamptz not null default now()
);

create table public.delivery_note_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  delivery_note_id uuid not null references public.delivery_notes (id) on delete cascade,
  source_type text not null check (source_type in ('stock_fulfillment', 'grn_item')),
  source_id uuid not null,
  item_name text not null,
  unit text not null,
  qty numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create index delivery_notes_business_id_idx on public.delivery_notes (business_id);
create index delivery_notes_pr_id_idx on public.delivery_notes (purchase_request_id);
create index delivery_note_items_dn_id_idx on public.delivery_note_items (delivery_note_id);

alter table public.delivery_notes enable row level security;
alter table public.delivery_note_items enable row level security;

create policy "Owner manages delivery notes of own businesses"
on public.delivery_notes for all
using (private.owns_business(business_id)) with check (private.owns_business(business_id));

create policy "Owner manages delivery note items of own businesses"
on public.delivery_note_items for all
using (private.owns_business(business_id)) with check (private.owns_business(business_id));
