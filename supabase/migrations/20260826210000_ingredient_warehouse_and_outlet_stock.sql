-- Modul Cost Control: konsep gudang.
--
-- 1. Bahan baku digudangkan di Gudang Kering ATAU Gudang Basah (satu bahan
-- cuma satu gudang, owner sudah konfirmasi). Karena stoknya tetap satu angka
-- per bahan (persis seperti sekarang), ini cukup jadi LABEL/kategori baru di
-- `ingredients` — bukan tabel stok multi-lokasi. Mirip persis pola kolom
-- `department` (dapur/bar/front) yang sudah ada untuk pengelompokan lain.
-- Nullable/opsional — bahan yang belum dikelompokkan tetap tampil normal,
-- dan bisnis non-cost-control tidak pernah mengisi kolom ini.
alter table public.ingredients
  add column warehouse text check (warehouse is null or warehouse in ('Gudang Kering', 'Gudang Basah'));

-- 2. Stock per outlet ("Stock Resto" & "Stock Bar" — bar didaftarkan sebagai
-- outlet biasa, owner sudah konfirmasi tidak perlu tabel gudang terpisah).
-- Beda dari semi_finished_items.stock (itu stok GUDANG PUSAT/Gudang Setengah
-- Jadi) — ini saldo yang sudah DIKIRIM ke outlet tertentu, bertambah setiap
-- outlet_requests disetujui. Snapshot murni penambahan; pengurangan (mis.
-- kalau nanti ada pencatatan penjualan/pemakaian di outlet) di luar scope
-- saat ini.
create table public.outlet_stock (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  semi_finished_item_id uuid not null references public.semi_finished_items (id) on delete cascade,
  stock numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (outlet_id, semi_finished_item_id)
);

create index outlet_stock_business_id_idx on public.outlet_stock (business_id);
create index outlet_stock_outlet_id_idx on public.outlet_stock (outlet_id);

create trigger outlet_stock_set_updated_at
  before update on public.outlet_stock
  for each row execute function private.set_updated_at();

alter table public.outlet_stock enable row level security;

create policy "Owner manages outlet stock of own businesses"
on public.outlet_stock for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
