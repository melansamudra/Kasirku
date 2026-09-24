-- updateSemiFinishedItem (semi-finished-items/actions.ts) menulis
-- ingredient_price_history dengan source='bsj' setiap kali HPP manual BSJ
-- diubah, tapi constraint lama cuma izinkan ('awal','pembelian','manual',
-- 'impor') -- insert itu gagal diam-diam (error-nya tidak pernah dicek di
-- action-nya) sejak fitur HPP manual BSJ ada. Ditemukan saat convert
-- Singkong D9 (Llauk Nusantara) dari GR ke PCS 2026-09-24.
alter table public.ingredient_price_history drop constraint ingredient_price_history_source_chk;
alter table public.ingredient_price_history add constraint ingredient_price_history_source_chk
  check (source in ('awal', 'pembelian', 'manual', 'impor', 'bsj'));
