-- Reverts 20260713110000_hpp_standalone_tool.sql — the standalone web tool
-- (own light account, ingredients/menu stored in our DB, AI recommendations)
-- was replaced same-day by a downloadable desktop app that keeps data purely
-- local on the buyer's machine, so this backend is no longer used by
-- anything and is being dropped rather than left dormant.
drop table if exists public.hpp_recipe_lines;
drop table if exists public.hpp_menu_items;
drop table if exists public.hpp_ingredients;
