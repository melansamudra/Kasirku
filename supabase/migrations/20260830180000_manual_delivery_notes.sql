-- Surat Jalan MANUAL -- dokumen bebas isi sendiri (tujuan + daftar barang
-- diketik manual), SENGAJA TERPISAH TOTAL dari `delivery_notes` yang sudah
-- ada (itu otomatis, hasil turunan rantai PR fulfillment/GRN). User minta
-- ini dulu (2026-08-30) karena rantai otomatisnya belum diuji coba buat
-- order-order sungguhan -- jadi Purchasing butuh cara cetak Surat Jalan
-- yang tidak bergantung sama sekali ke data PR/PO/alokasi. Tidak
-- memindahkan stok apa pun -- murni dokumen.
create table public.manual_delivery_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  location_id uuid not null references public.stock_locations (id) on delete restrict,
  dn_number text not null,
  destination text not null,
  note text,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);

create table public.manual_delivery_note_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  manual_delivery_note_id uuid not null references public.manual_delivery_notes (id) on delete cascade,
  item_name text not null,
  unit text,
  qty numeric(12, 2) not null,
  sort_order int not null default 0
);

create index manual_delivery_notes_business_id_idx on public.manual_delivery_notes (business_id);
create index manual_delivery_notes_location_id_idx on public.manual_delivery_notes (location_id);
create index manual_delivery_note_items_dn_id_idx on public.manual_delivery_note_items (manual_delivery_note_id);

alter table public.manual_delivery_notes enable row level security;
alter table public.manual_delivery_note_items enable row level security;

create policy "Owner manages manual delivery notes of own businesses"
on public.manual_delivery_notes for all
using (private.owns_business(business_id)) with check (private.owns_business(business_id));

create policy "Owner manages manual delivery note items of own businesses"
on public.manual_delivery_note_items for all
using (private.owns_business(business_id)) with check (private.owns_business(business_id));
