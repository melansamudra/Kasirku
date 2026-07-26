-- Ingredient bulk import (importIngredients, ingredients/actions.ts) needs a
-- distinct source value for price-history rows it writes — reusing 'manual'
-- would misattribute bulk-imported price changes as individual manual edits.
alter table public.ingredient_price_history drop constraint ingredient_price_history_source_chk;
alter table public.ingredient_price_history add constraint ingredient_price_history_source_chk
  check (source in ('awal', 'pembelian', 'manual', 'impor'));
