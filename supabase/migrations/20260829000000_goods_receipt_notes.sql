-- GRN (Goods Receipt Note / Bukti Penerimaan Barang), Fase 2 Cost Control.
-- markAllocationReceived (permintaan-barang/actions.ts) cuma flip timestamp
-- tanpa qty/kondisi barang -- gap ini diisi di sini, khusus jalur PO
-- (barang dari supplier, diterima fisik oleh stock keeper di Gudang Utama).
-- GRN murni dokumentasi: TIDAK mengubah stok (stok tetap dari "Catat
-- Pembelian" seperti sebelumnya, di luar scope ronde ini). Boleh lebih dari
-- 1 GRN per PO (pengiriman parsial) -- "sudah diterima penuh" dihitung live
-- dari SUM(qty_received) per purchase_order_item, bukan kolom status.

create table public.goods_receipt_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  grn_number text not null,
  received_by text not null,
  note text,
  created_at timestamptz not null default now()
);

create table public.goods_receipt_note_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  grn_id uuid not null references public.goods_receipt_notes (id) on delete cascade,
  purchase_order_item_id uuid not null references public.purchase_order_items (id) on delete cascade,
  qty_received numeric(12, 2) not null check (qty_received >= 0),
  condition text not null check (condition in ('ok', 'rejected')),
  condition_note text,
  created_at timestamptz not null default now()
);

create index goods_receipt_notes_business_id_idx on public.goods_receipt_notes (business_id);
create index goods_receipt_notes_po_id_idx on public.goods_receipt_notes (purchase_order_id);
create index goods_receipt_note_items_grn_id_idx on public.goods_receipt_note_items (grn_id);
create index goods_receipt_note_items_po_item_id_idx on public.goods_receipt_note_items (purchase_order_item_id);

alter table public.goods_receipt_notes enable row level security;
alter table public.goods_receipt_note_items enable row level security;

create policy "Owner manages goods receipt notes of own businesses"
on public.goods_receipt_notes for all
using (private.owns_business(business_id)) with check (private.owns_business(business_id));

create policy "Owner manages goods receipt note items of own businesses"
on public.goods_receipt_note_items for all
using (private.owns_business(business_id)) with check (private.owns_business(business_id));
