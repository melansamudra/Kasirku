-- Kalkulator HPP Mandiri: standalone product (roadmap item — "Kalkulator HPP
-- dijual terpisah"). Scoped per-user (auth.uid()), NOT per-business — this is
-- deliberately outside the businesses/owns_business tenant model, since a
-- user of this tool doesn't necessarily have (or want) a KasirKu store. See
-- src/app/dashboard/page.tsx's hpp_tool_only branch for how these users skip
-- the normal /onboarding (create-a-business) flow.
create table public.hpp_ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  unit text not null,
  unit_cost numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hpp_menu_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_margin_percent numeric(5, 2) not null default 30,
  ai_recommended_price numeric(12, 2),
  ai_rationale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- user_id is denormalized here too (not just derivable via menu_item_id join)
-- so RLS stays a flat `using (user_id = auth.uid())` on every table, matching
-- the simplest existing RLS pattern in this project rather than a subquery.
create table public.hpp_recipe_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  menu_item_id uuid not null references public.hpp_menu_items(id) on delete cascade,
  ingredient_id uuid not null references public.hpp_ingredients(id) on delete cascade,
  qty numeric(12, 4) not null,
  created_at timestamptz not null default now()
);

create index hpp_ingredients_user_id_idx on public.hpp_ingredients(user_id);
create index hpp_menu_items_user_id_idx on public.hpp_menu_items(user_id);
create index hpp_recipe_lines_user_id_idx on public.hpp_recipe_lines(user_id);
create index hpp_recipe_lines_menu_item_id_idx on public.hpp_recipe_lines(menu_item_id);

alter table public.hpp_ingredients enable row level security;
alter table public.hpp_menu_items enable row level security;
alter table public.hpp_recipe_lines enable row level security;

create policy "own hpp_ingredients" on public.hpp_ingredients
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own hpp_menu_items" on public.hpp_menu_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own hpp_recipe_lines" on public.hpp_recipe_lines
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
