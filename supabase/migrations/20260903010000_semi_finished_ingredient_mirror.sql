-- Setiap Bahan Setengah Jadi (BSJ) sekarang otomatis punya "kembaran" di
-- tabel ingredients (Bahan Baku). Ini SENGAJA supaya product_recipes,
-- checkout_transaction, void_transaction, owner_void_transaction,
-- void_transaction_item, dan recalculateProductCostsForIngredient TIDAK
-- PERLU diubah sama sekali -- semua itu sudah paham cara kerja dengan
-- ingredients biasa. Resep produk (mis. "Nasi Goreng") tinggal pilih BSJ
-- dari dropdown Bahan Baku yang sudah ada, dan checkout otomatis potong
-- stoknya lewat jalur ingredient yang sudah berjalan.
--
-- Stok "asli" BSJ (yang dipakai checkout/resep produk) = ingredients.stock
-- milik kembarannya, ditambah lewat fitur baru "Produksi" (lihat kode app).
-- Kolom semi_finished_items.stock (lama, flat) dibiarkan ada tapi berhenti
-- dipakai -- tidak di-drop supaya migrasi ini tetap murah/aman.
alter table public.semi_finished_items
  add column ingredient_id uuid references public.ingredients (id) on delete set null;

create unique index semi_finished_items_ingredient_id_uq
  on public.semi_finished_items (ingredient_id) where ingredient_id is not null;

-- Backfill BSJ yang sudah ada (kalau ada) supaya semua BSJ dijamin punya
-- kembaran begitu migrasi ini selesai -- kode app (addSemiFinishedItem)
-- cuma menangani pembuatan BSJ BARU ke depannya.
do $$
declare
  r record;
  new_ingredient_id uuid;
begin
  for r in
    select id, business_id, name, unit, min_stock
    from public.semi_finished_items
    where ingredient_id is null and deleted_at is null
  loop
    insert into public.ingredients (business_id, name, unit, unit_cost, stock, min_stock)
    values (r.business_id, r.name, r.unit, 0, 0, coalesce(r.min_stock, 0))
    returning id into new_ingredient_id;

    update public.semi_finished_items set ingredient_id = new_ingredient_id where id = r.id;
  end loop;
end $$;
