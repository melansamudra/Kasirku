-- Opsi HPP manual untuk Bahan Setengah Jadi -- sebagian item (terutama yang
-- resepnya belum sempat dipetakan detail) lebih gampang diisi HPP-nya
-- langsung (mis. dari kartu resep Excel lama) daripada bikin resep BOM
-- penuh dulu. Kalau kolom ini terisi, dipakai LANGSUNG sebagai HPP final
-- (resep/fluctuation di-skip total) -- lihat resolveSemiFinished di
-- compute-cost.ts.
alter table public.semi_finished_items
  add column manual_unit_cost numeric(14, 4);
