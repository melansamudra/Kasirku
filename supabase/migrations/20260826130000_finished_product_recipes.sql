-- BOM produk jadi — sama pola dengan semi_finished_recipes, tapi parent-nya
-- finished_products dan qty didefinisikan per 1 unit produk jadi (mis. per
-- kemasan). finished_products tidak pernah jadi komponen resep apa pun (baik
-- di sini maupun di semi_finished_recipes) — produk jadi selalu di ujung
-- rantai BOM.

create table public.finished_product_recipes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  finished_product_id uuid not null references public.finished_products (id) on delete cascade,
  component_type text not null check (component_type in ('ingredient', 'semi_finished')),
  ingredient_id uuid references public.ingredients (id) on delete restrict,
  semi_finished_item_id uuid references public.semi_finished_items (id) on delete restrict,
  qty numeric(12, 4) not null check (qty > 0),
  unit text not null,
  created_at timestamptz not null default now(),
  constraint finished_product_recipes_component_ref_chk check (
    (component_type = 'ingredient' and ingredient_id is not null and semi_finished_item_id is null)
    or
    (component_type = 'semi_finished' and semi_finished_item_id is not null and ingredient_id is null)
  )
);

create index finished_product_recipes_product_id_idx on public.finished_product_recipes (finished_product_id);
create index finished_product_recipes_semi_id_idx on public.finished_product_recipes (semi_finished_item_id);
create index finished_product_recipes_ingredient_id_idx on public.finished_product_recipes (ingredient_id);

alter table public.finished_product_recipes enable row level security;

create policy "Owner manages finished product recipes of own businesses"
on public.finished_product_recipes for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
