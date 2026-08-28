-- Data referensi hasil import Excel (breakdown resep Bahan Setengah Jadi
-- ala sheet "dataglobal") -- sumber untuk halaman
-- semi-finished-items/import ("ketik nama, bahan muncul otomatis, klik
-- Simpan"). Bukan tempat resep final -- resep final tetap di
-- semi_finished_recipes, dibuat lewat action saveBsjImport setelah staf
-- review angkanya di halaman import.
create table public.bsj_import_staging (
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

create index bsj_import_staging_business_item_idx on public.bsj_import_staging (business_id, item_name);

alter table public.bsj_import_staging enable row level security;

create policy "Owner manages bsj import staging of own businesses"
on public.bsj_import_staging for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
