-- Stok Opname formal buat Gudang standalone -- reuse stock_opname_entries
-- yang sudah ada (pola sama "ingredient"/"semi_finished") dengan tambah
-- component_type ketiga: "warehouse_item". Alur verifikasi (applyOpnameEntry
-- dkk di stock-opname/actions.ts) tidak perlu tabel baru sama sekali,
-- cuma tambah 1 cabang logic buat baca/tulis warehouse_items.stock.
alter table public.stock_opname_entries
  add column warehouse_item_id uuid references public.warehouse_items (id) on delete cascade;

create index stock_opname_entries_warehouse_item_id_idx
  on public.stock_opname_entries (warehouse_item_id);

alter table public.stock_opname_entries
  drop constraint stock_opname_entries_component_type_check;
alter table public.stock_opname_entries
  add constraint stock_opname_entries_component_type_check
  check (component_type in ('ingredient', 'semi_finished', 'warehouse_item'));

alter table public.stock_opname_entries drop constraint stock_opname_entries_component_chk;
alter table public.stock_opname_entries add constraint stock_opname_entries_component_chk check (
  (component_type = 'ingredient' and ingredient_id is not null and semi_finished_item_id is null and warehouse_item_id is null)
  or
  (component_type = 'semi_finished' and semi_finished_item_id is not null and ingredient_id is null and warehouse_item_id is null)
  or
  (component_type = 'warehouse_item' and warehouse_item_id is not null and ingredient_id is null and semi_finished_item_id is null)
);
