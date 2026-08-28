-- Approval PO ("Menunggu Approval" / label Otorisasi Formal) SEBELUMNYA
-- cuma status informasi -- barang tetap bisa ditandai "Barang Datang" dan
-- dicatat sebagai Pembelian tanpa PO-nya di-approve dulu. Sekarang jadi
-- gerbang beneran: markAllocationReceived (di actions.ts) mengecek status
-- PO lewat kolom baru ini sebelum mengizinkan barang ditandai datang.
--
-- purchase_order_items sebelumnya cuma baris denormalized (item_name/qty/
-- harga) tanpa jejak balik ke alokasi asalnya -- padahal forwardAllocationsToSupplier
-- selalu bikin 1 baris purchase_order_items per 1 purchase_request_item_allocation
-- (lihat `allocations.map(...)` di actions.ts), jadi aman ditautkan 1:1.
alter table public.purchase_order_items
  add column allocation_id uuid references public.purchase_request_item_allocations (id) on delete set null;

create index purchase_order_items_allocation_id_idx on public.purchase_order_items (allocation_id);
