-- Data resep nyata dari Lauk Nusantara menemukan kasus qty per-1-unit-hasil
-- yang sangat kecil (mis. 0.0000467 PCS sekengkel sapi per gram kuah) —
-- numeric(12,4) membulatkannya jadi 0 dan menabrak check constraint qty>0.
-- Naikkan presisi ke 8 angka desimal supaya rasio sekecil apa pun tetap
-- tersimpan akurat.
alter table public.semi_finished_recipes alter column qty type numeric(16, 8);
alter table public.finished_product_recipes alter column qty type numeric(16, 8);
