-- Sama seperti bsj_import_staging, tapi untuk Produk Jadi -- bahannya boleh
-- Bahan Baku ATAU Bahan Setengah Jadi (dua tabel sumber, bukan cuma satu),
-- makanya butuh component_type + 2 kolom FK terpisah kayak
-- finished_product_recipes.
create table public.finished_product_import_staging (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  item_name text not null,
  component_type text not null check (component_type in ('ingredient', 'semi_finished')),
  ingredient_id uuid references public.ingredients (id) on delete cascade,
  semi_finished_item_id uuid references public.semi_finished_items (id) on delete cascade,
  qty_per_batch numeric(14, 4) not null,
  unit text not null,
  batch_yield numeric(12, 2) not null,
  source_file text,
  created_at timestamptz not null default now(),
  constraint finished_product_import_staging_component_chk check (
    (component_type = 'ingredient' and ingredient_id is not null and semi_finished_item_id is null)
    or
    (component_type = 'semi_finished' and semi_finished_item_id is not null and ingredient_id is null)
  )
);

create index finished_product_import_staging_business_item_idx on public.finished_product_import_staging (business_id, item_name);

alter table public.finished_product_import_staging enable row level security;

create policy "Owner manages finished product import staging of own businesses"
on public.finished_product_import_staging for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
