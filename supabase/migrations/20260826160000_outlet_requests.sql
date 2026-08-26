-- Permintaan bahan setengah jadi dari outlet ke dapur pusat. Beda dari
-- Permintaan Barang (purchase_requests) yang sumbernya banyak supplier
-- eksternal dan butuh tabel alokasi terpisah — di sini sumbernya selalu satu
-- (stok dapur pusat sendiri), jadi cukup satu langkah setuju/tolak tanpa
-- tabel alokasi.
--
-- `qty_approved`/`value` di outlet_request_items diisi SEKALI saat request
-- disetujui (snapshot qty yang benar-benar dipenuhi & nilai HPP saat itu) —
-- tidak berubah lagi setelahnya walau HPP bahan setengah jadi kemudian
-- berubah.

create table public.outlet_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  outlet_id uuid references public.outlets (id) on delete restrict,
  outlet_name text not null,
  employee_id uuid references public.employees (id) on delete set null,
  employee_name text not null,
  status text not null default 'baru' check (status in ('baru', 'disetujui', 'ditolak')),
  note text,
  reject_reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index outlet_requests_business_id_idx on public.outlet_requests (business_id, created_at desc);
create index outlet_requests_outlet_id_idx on public.outlet_requests (outlet_id);

alter table public.outlet_requests enable row level security;

create policy "Owner manages outlet requests of own businesses"
on public.outlet_requests for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

create table public.outlet_request_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  outlet_request_id uuid not null references public.outlet_requests (id) on delete cascade,
  semi_finished_item_id uuid references public.semi_finished_items (id) on delete set null,
  item_name text not null,
  unit text not null,
  qty_requested numeric(12, 2) not null check (qty_requested > 0),
  qty_approved numeric(12, 2),
  value numeric(14, 2),
  created_at timestamptz not null default now()
);

create index outlet_request_items_request_id_idx on public.outlet_request_items (outlet_request_id);

alter table public.outlet_request_items enable row level security;

create policy "Owner manages outlet request items of own businesses"
on public.outlet_request_items for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
