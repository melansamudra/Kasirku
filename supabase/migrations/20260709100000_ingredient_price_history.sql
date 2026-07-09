-- Module: tren harga bahan baku. ingredients.unit_cost only ever stores the
-- current value — this is an append-only event log so price movement over
-- time can be reported.

create table public.ingredient_price_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  unit_cost numeric(12, 2) not null,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  constraint ingredient_price_history_source_chk check (source in ('awal', 'pembelian', 'manual'))
);

create index ingredient_price_history_business_id_idx
  on public.ingredient_price_history (business_id, created_at desc);
create index ingredient_price_history_ingredient_id_idx
  on public.ingredient_price_history (ingredient_id, created_at desc);

alter table public.ingredient_price_history enable row level security;

create policy "Owner manages ingredient price history of own businesses"
on public.ingredient_price_history for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Backfill: seed the current price as the first data point for existing
-- ingredients, so the trend report isn't empty for businesses that already
-- have ingredients on record.
insert into public.ingredient_price_history (business_id, ingredient_id, unit_cost, source)
select business_id, id, unit_cost, 'awal'
from public.ingredients
where deleted_at is null;
