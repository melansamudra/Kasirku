-- Structured category names per business, so the product form can offer a
-- dropdown instead of free text (typos/near-duplicates like "Minuman" vs
-- "minuman " routed kitchen tickets to the wrong printer). products.category
-- stays a plain text column (unchanged) — kitchen_printers.categories and
-- everywhere else already key off the category NAME string, not an id, so
-- this table only constrains/populates what names are valid, it doesn't
-- become a new foreign key.

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (business_id, name)
);

create index product_categories_business_id_idx on public.product_categories (business_id);

alter table public.product_categories enable row level security;

create policy "Owner manages product categories of own businesses"
on public.product_categories for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
