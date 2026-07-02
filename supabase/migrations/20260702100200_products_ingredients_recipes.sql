-- Module 2: products, ingredients, product_recipes — master data.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  category text,
  price numeric(12, 2) not null default 0,
  cost numeric(12, 2) not null default 0,
  stock numeric(12, 2) not null default 0,
  barcode text,
  image_url text,
  emoji text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_business_id_idx on public.products (business_id);
-- Barcode only needs to be unique among live (non-deleted) products of a business.
create unique index products_business_id_barcode_key
  on public.products (business_id, barcode)
  where barcode is not null and deleted_at is null;

create trigger products_set_updated_at
  before update on public.products
  for each row execute function private.set_updated_at();

alter table public.products enable row level security;

create policy "Owner manages products of own businesses"
on public.products for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Ingredients ------------------------------------------------------------

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  unit text not null,
  unit_cost numeric(12, 2) not null default 0,
  stock numeric(12, 2) not null default 0,
  deleted_at timestamptz
);

create index ingredients_business_id_idx on public.ingredients (business_id);

alter table public.ingredients enable row level security;

create policy "Owner manages ingredients of own businesses"
on public.ingredients for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Product recipes (products <-> ingredients) ------------------------------

create table public.product_recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  ingredient_name_manual text,
  qty numeric(12, 4) not null,
  unit text not null,
  constraint product_recipes_ingredient_ref_chk
    check (ingredient_id is not null or ingredient_name_manual is not null)
);

create index product_recipes_product_id_idx on public.product_recipes (product_id);
create index product_recipes_ingredient_id_idx on public.product_recipes (ingredient_id);

alter table public.product_recipes enable row level security;

create policy "Owner manages recipes of own products"
on public.product_recipes for all
using (
  exists (
    select 1 from public.products p
    where p.id = product_recipes.product_id
      and private.owns_business(p.business_id)
  )
)
with check (
  exists (
    select 1 from public.products p
    where p.id = product_recipes.product_id
      and private.owns_business(p.business_id)
  )
);
