-- Backfill batch_yield_qty untuk item Bahan Setengah Jadi yang diimpor lewat
-- /semi-finished-items/import SEBELUM kolom ini ada (kolomnya baru dibuat di
-- 20260829020000_semi_finished_batch_yield.sql). Akibatnya ~59 item (mis.
-- "Asem Daging") tersimpan dengan qty per-1-porsi yang benar (mis. Air
-- 20ml/52porsi = 0.385ml) tapi tanpa info "52 porsi"-nya, jadi user bingung
-- lihat 0.385 dan tidak bisa lagi input dalam mode "per batch". Angka porsi
-- aslinya masih ada di bsj_import_staging.batch_yield -- tidak perlu re-upload.
-- Hanya isi yang masih NULL, tidak menimpa item yang sudah diisi manual lewat
-- RecipeYieldForm.
update public.semi_finished_items sfi
set batch_yield_qty = s.batch_yield
from (
  select distinct on (business_id, item_name)
    business_id, item_name, batch_yield
  from public.bsj_import_staging
  order by business_id, item_name, created_at desc
) s
where sfi.business_id = s.business_id
  and sfi.name = s.item_name
  and sfi.batch_yield_qty is null
  and sfi.deleted_at is null;
