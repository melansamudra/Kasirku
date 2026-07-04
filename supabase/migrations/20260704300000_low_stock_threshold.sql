-- Module: low stock notification. Owner sets a minimum stock threshold per
-- product/ingredient (0 = tracking disabled for that item); UI surfaces a
-- warning badge when stock falls at or below it.

alter table public.products
  add column if not exists min_stock numeric(12, 2) not null default 0;

alter table public.ingredients
  add column if not exists min_stock numeric(12, 2) not null default 0;
