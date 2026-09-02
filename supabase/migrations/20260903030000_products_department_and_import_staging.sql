-- Tag divisi per produk (persis pola ingredients.department) -- dipakai
-- halaman "Data Produk" per lokasi (Kitchen/Bar) buat filter produk mana
-- yang jadi tanggung jawab divisi itu.
alter table public.products
  add column department text check (department is null or department in ('dapur', 'bar', 'front'));

-- Staging untuk wizard import resep produk dari Excel (products/import),
-- adaptasi dari finished_product_import_staging milik Llauk -- lebih
-- sederhana karena cuma 1 sumber bahan (ingredients biasa, termasuk
-- kembaran BSJ), bukan 2 sumber (ingredients + semi_finished_items) seperti
-- punya Llauk.
create table public.product_import_staging (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  item_name text not null,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  qty_per_batch numeric(14, 4) not null,
  unit text not null,
  batch_yield numeric(12, 2) not null,
  source_file text,
  created_at timestamptz not null default now()
);

create index product_import_staging_business_item_idx on public.product_import_staging (business_id, item_name);

alter table public.product_import_staging enable row level security;

create policy "Owner manages product import staging of own businesses"
on public.product_import_staging for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
