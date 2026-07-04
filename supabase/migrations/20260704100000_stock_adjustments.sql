-- Module: stock opname / manual stock adjustments for products & ingredients.
-- Distinct from purchases (expenses.qty already increases stock and re-averages
-- cost) — this is for correcting stock to match a physical count, in either
-- direction, without touching cost/HPP.

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  ingredient_id uuid references public.ingredients (id) on delete set null,
  item_name text not null,
  unit text,
  stock_before numeric(12, 2) not null,
  stock_after numeric(12, 2) not null,
  diff numeric(12, 2) not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint stock_adjustments_target_chk check (
    (product_id is not null and ingredient_id is null)
    or (product_id is null and ingredient_id is not null)
  )
);

create index stock_adjustments_business_id_idx
  on public.stock_adjustments (business_id, created_at desc);
create index stock_adjustments_product_id_idx on public.stock_adjustments (product_id);
create index stock_adjustments_ingredient_id_idx on public.stock_adjustments (ingredient_id);

alter table public.stock_adjustments enable row level security;

create policy "Owner manages stock adjustments of own businesses"
on public.stock_adjustments for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
