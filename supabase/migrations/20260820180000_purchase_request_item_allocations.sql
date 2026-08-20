-- Revisi Permintaan Barang lagi: satu barang kadang harus dibeli dari 2+
-- supplier sekaligus (misal qty besar, satu supplier ga sanggup semua), jadi
-- supplier+qty+status pindah dari "per barang" jadi "per alokasi" (satu
-- barang bisa punya beberapa baris alokasi, masing-masing ke supplier &
-- qty-nya sendiri). Alokasi ini juga yang jadi jembatan riwayat: kapan
-- diteruskan, kapan barang datang, dan kalau sudah dicatat sebagai
-- pembelian resmi (nyambung ke public.purchases, otomatis ikut jurnal
-- akuntansi yang sudah ada di fitur itu).

alter table public.purchase_request_items
  drop column supplier_id,
  drop column forwarded_at;

create table public.purchase_request_item_allocations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  purchase_request_item_id uuid not null references public.purchase_request_items (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  qty numeric(12, 2) not null check (qty > 0),
  forwarded_at timestamptz,
  received_at timestamptz,
  purchase_id uuid references public.purchases (id) on delete set null,
  created_at timestamptz not null default now()
);

create index purchase_request_item_allocations_item_id_idx
  on public.purchase_request_item_allocations (purchase_request_item_id);
create index purchase_request_item_allocations_business_id_idx
  on public.purchase_request_item_allocations (business_id);

alter table public.purchase_request_item_allocations enable row level security;

create policy "Owner manages purchase request item allocations of own businesses"
on public.purchase_request_item_allocations for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
