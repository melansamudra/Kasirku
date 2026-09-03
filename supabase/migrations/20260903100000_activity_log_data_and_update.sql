-- PDO (Permintaan Dana Operasional) sekarang bisa diedit -- butuh (1) tempat
-- nyimpen snapshot terstruktur dokumennya (bukan cuma teks tampilan) supaya
-- form bisa diisi ulang persis saat dibuka untuk edit, dan (2) izin UPDATE
-- di activity_log yang sebelumnya cuma boleh INSERT/SELECT.

alter table public.activity_log add column if not exists data jsonb;

create policy "Owner updates activity for own businesses"
on public.activity_log for update
using (business_id is null or private.owns_business(business_id))
with check (business_id is null or private.owns_business(business_id));
