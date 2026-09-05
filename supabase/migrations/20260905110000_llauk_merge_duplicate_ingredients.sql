-- Gabungkan 42 grup bahan baku duplikat Llauk Nusantara (dari total 48 --
-- 6 grup sisanya punya 2 kandidat yang SAMA-SAMA berharga asli, sengaja
-- dilewati di sini, ditanya ke user secara terpisah). Root cause: 3 tempat
-- yang bikin "kembaran" ingredient buat BSJ (addSemiFinishedItem,
-- importSemiFinishedManual, saveBsjImport) dulu SELALU insert baris baru
-- tanpa cek existing dulu -- sudah diperbaiki di kode (findOrCreateMirrorIngredient,
-- commit 80a380a). Migration ini membereskan data lama yang sudah kadung
-- dibuat SEBELUM fix itu ada.
--
-- Kanonik dipilih: baris dengan unit_cost > 0 (data harga asli, biasanya
-- dari Stock Opname) menang atas baris stub (kebanyakan unit=PCS,
-- unit_cost=0, hasil bug mirror-BSJ). Referensi (resep, histori harga,
-- mirror BSJ, dst) dipindah ke kanonik, baris duplikat di-SOFT-DELETE
-- (deleted_at, bukan DELETE permanen) -- reversibel dengan set deleted_at
-- balik ke null kalau ternyata ada yang salah pilih.

create temporary table ingredient_merge_map (loser_id uuid primary key, canonical_id uuid not null) on commit drop;

insert into ingredient_merge_map (loser_id, canonical_id) values
  ('d5076917-4f9a-454f-95ff-4cb58b0b9558', '04583d65-7602-4b49-824d-3f9e42978fe4'), -- tahu walik (loser: PCS, Rp0)
  ('0853e160-1ba1-4a70-8b1e-8ed612a83898', 'b05314b5-0924-47d9-b67e-7787109987f7'), -- sambal goreng krecek (loser: PCS, Rp0)
  ('0d28b3f1-b154-4bb1-99b0-d56fda10fa44', '2cbb1a51-950e-4c16-97cb-d3c287ef3fba'), -- baramundi fillet (loser: PCS, Rp0)
  ('b8c0a3af-8a3e-4605-82bf-2065707d4aed', '13ba7794-6562-461b-8932-0cec815e531f'), -- kuah rawon (loser: PCS, Rp0)
  ('144f0b25-e9d1-41a2-9c45-088773dfcb36', '7bd6a25a-459b-4c64-b155-810a99746951'), -- iga bakar (loser: PCS, Rp0)
  ('620ebaca-fc00-4809-9272-4cab24be2636', '17105832-978a-49d6-bbe0-cf2f9cdac425'), -- udang bakar (loser: PCS, Rp0)
  ('1be5a3ee-f943-4560-b7f5-d504a6de8cbf', 'e363502a-e741-4318-985a-297df32cad33'), -- sate koyor (loser: PCS, Rp0)
  ('28eb7eaf-7fdb-4db3-b6ac-ee3847382118', '3db0722b-4436-4cd2-9aca-c4ad21ffb11e'), -- kuah serani (loser: PCS, Rp0)
  ('984c866b-ae9a-4390-a072-1ca940892bdd', '299ba5bb-99fa-48f4-8a43-0e6aa5389165'), -- kambing nasgor (loser: PCS, Rp0)
  ('3c613786-bcfc-4cad-8d9a-245c5f6dac90', '2a15eecd-4889-4133-8c7d-c0d1181c1705'), -- mie kuning (loser: PCS, Rp0)
  ('2c6ee508-b679-4ce3-aaf3-91c5466babb8', '2da4572a-76af-4172-9dc8-ca84b69064bc'), -- bumbu betutu (loser: PCS, Rp0)
  ('77d54fd4-ecfa-494f-b103-8337dcd387c3', '2e08523f-6cbf-4505-9c24-08f048012beb'), -- cakalang (loser: PCS, Rp0)
  ('336a2053-ce43-4105-af9f-59f4b33c6778', '8e65fc8c-fd18-4a7e-9154-ba4b8aa08dd2'), -- bumbu jimbaran (loser: PCS, Rp0)
  ('83f97815-aeaf-47ed-937e-7f0be4920b41', '33c4c373-6c65-43e3-b692-225b83928709'), -- tauge panjang (loser: PCS, Rp0)
  ('351096a1-73d8-4416-8023-24e9fdff0235', 'bd54fdfb-e70f-411a-bc96-0a37bef4ebe9'), -- tahu susu (loser: PCS, Rp0)
  ('e89351b3-1e47-4ee7-96f6-86f848bae61a', '38334f04-99e8-404a-afd4-c4b5fedbcee8'), -- bumbu keropok (loser: PCS, Rp0)
  ('42190e15-0388-49d2-94fa-2f553544ea23', '56eb8d77-6c4c-492f-917a-2dd98c8154bf'), -- bebek ungkep (loser: PCS, Rp0)
  ('93da4b2d-7c0d-46e9-b255-51fff23a74d1', '4a4266b0-71ca-4e03-9e8f-0cd748dbf0f7'), -- kuah klaten (loser: PCS, Rp0)
  ('4d635d3a-4083-44d1-abe0-a0268bfd8ff2', 'e3879a14-361a-41b5-83ce-9dd2992f9885'), -- gurame (loser: PCS, Rp0)
  ('4da91f4e-c387-4557-8f95-9d9632c6211d', 'd26d20d4-e6a1-489b-a3f5-037bc4cce1aa'), -- ayam boiler (loser: PCS, Rp0)
  ('554c6451-659f-43a1-9bcd-2faf37cea5d0', 'e00d3610-5b35-412e-974f-8c4c35530936'), -- telur asin (loser: PCS, Rp0)
  ('97a33476-16d5-4ef9-96f2-f4e62b3df845', '5b9be9bc-7e44-4db9-9517-102be6a2d071'), -- sate maranggi (loser: PCS, Rp0)
  ('5e70cf5a-333d-4bc1-9034-bba5a536dd82', 'a00b34ad-1d88-41f3-8005-49ede1ddf281'), -- bumbu taliwang (loser: PCS, Rp0)
  ('632cccaa-32d3-4200-a636-b1ceb27db7f8', 'cf207617-9c39-4a6c-be6f-401f869d1358'), -- kuah opor (loser: PCS, Rp0)
  ('c4345154-c614-4647-9803-8e6bb106370f', '6ea1620f-01da-4947-9266-616be336fb73'), -- buncis (loser: PCS, Rp0)
  ('ff76a5dc-ca4c-4a3e-a621-1c493d8e6f7c', '71eb8cb2-9b1f-46ca-96d7-5ee78891a5b2'), -- kuah asem jakarta (loser: PCS, Rp0)
  ('7226f2de-bc10-4eda-8c4b-85f24bde1973', 'fa065cb1-818c-4ff1-9177-1994db20826a'), -- sate raja (loser: PCS, Rp0)
  ('9af4adff-c151-4506-896d-95f449e7ecdd', '7291ba72-15a3-4139-9643-a71ad6a732dc'), -- cumi ring (loser: PCS, Rp0)
  ('7e252c76-00e7-460e-8ff9-0e467bd90b7f', '90d815d8-036a-4774-aeb5-c434656343d2'), -- sate gendis (loser: PCS, Rp0)
  ('bf2f29af-3ebf-4e97-990a-82ffe02924b8', '7e35017a-5484-4beb-b3e6-bf1deb882c54'), -- kuah pesmol (loser: PCS, Rp0)
  ('879234e3-b034-4778-818b-d0dfe57c8261', 'c33b6a61-31bc-4d86-b128-ad84a2eaf390'), -- lumpia (loser: PCS, Rp0)
  ('eca5eb8a-4b5f-479e-826f-845aa9cde2ac', '98daf60e-c19b-4ef1-9e63-92acb1a6d72e'), -- sate lilit (loser: PCS, Rp0)
  ('9c4094c2-366e-4281-a169-60a193e7dad9', 'a27c55fc-8f09-4851-82e6-9cef19a0e6dc'), -- rahang tuna (loser: PCS, Rp0)
  ('a1bb87b6-f34c-45e7-905d-0de13420801d', 'd9a2792e-5819-493d-9bb8-399871b80781'), -- air rebusan iga (loser: porsi, Rp0)
  ('a30e8301-062f-48f5-9380-3f3a5164c6d2', 'e48861a8-7e3f-4f58-b262-1077d8fc7c02'), -- kangkung (loser: PCS, Rp0)
  ('f14ff160-dcae-4d08-aac9-30c60f84576e', 'aa93dff0-d1a6-4b4e-9002-c6056d0d06d1'), -- singkong d9 (loser: PCS, Rp0)
  ('acbc9816-d42a-4902-b80b-b33135f577c0', 'd47b2f23-1b0b-4383-a370-13b4e01c8b56'), -- bumbu aceh (loser: PCS, Rp0)
  ('b63065ef-e792-4e6e-88ca-160ae73eb54f', 'e923b894-e13a-4b73-ac3b-bf039d4e80ee'), -- ayam suwir (loser: PCS, Rp0)
  ('c07578a6-9b56-499d-b4cd-2d2f2c5a22b1', 'b7d67386-b1c5-4e3a-8a5d-219bbfe41de5'), -- bumbu raja (loser: PCS, Rp0)
  ('ca40a8d7-2a1d-43ca-9b4a-9bfa32128fee', 'c559d17d-376e-47fe-b0ba-143ed41ffdf3'), -- striploin (loser: PCS, Rp0)
  ('d53eece3-2430-425a-b773-ccf1481398e2', 'd4055c7d-0f39-4da5-8308-3fe6c4328b12'), -- kuah lodeh (loser: PCS, Rp0)
  ('d7dfbebc-7bb4-4c50-8c85-9417b9c03b1f', 'fe830d20-ceae-42ad-a4a0-b28534943acd'); -- bandeng (loser: PCS, Rp0)

-- Bebaskan slot unique index (semi_finished_items_ingredient_id_uq) kalau
-- ingredient kanonik kebetulan masih "dipegang" oleh BSJ yang SUDAH
-- dihapus (soft-delete BSJ -- deleteSemiFinishedItem -- tidak pernah
-- ikut mengosongkan ingredient_id-nya). Tanpa ini, remap mirror BSJ yang
-- masih hidup ke kanonik di bawah bisa gagal kena unique constraint.
-- Aman: cuma menyentuh baris BSJ yang SUDAH deleted_at, tidak ada BSJ
-- hidup yang kehilangan mirror-nya.
update public.semi_finished_items t set ingredient_id = null
  where t.deleted_at is not null
    and t.ingredient_id in (select canonical_id from ingredient_merge_map);

update public.product_recipes t set ingredient_id = m.canonical_id
  from ingredient_merge_map m where t.ingredient_id = m.loser_id;
update public.transaction_ingredient_consumption t set ingredient_id = m.canonical_id
  from ingredient_merge_map m where t.ingredient_id = m.loser_id;
update public.expenses t set ingredient_id = m.canonical_id
  from ingredient_merge_map m where t.ingredient_id = m.loser_id;
update public.stock_adjustments t set ingredient_id = m.canonical_id
  from ingredient_merge_map m where t.ingredient_id = m.loser_id;
update public.ingredient_price_history t set ingredient_id = m.canonical_id
  from ingredient_merge_map m where t.ingredient_id = m.loser_id;
update public.purchases t set ingredient_id = m.canonical_id
  from ingredient_merge_map m where t.ingredient_id = m.loser_id;
update public.purchase_request_items t set ingredient_id = m.canonical_id
  from ingredient_merge_map m where t.ingredient_id = m.loser_id;
update public.ingredient_purchase_units t set ingredient_id = m.canonical_id
  from ingredient_merge_map m where t.ingredient_id = m.loser_id;
update public.semi_finished_recipes t set ingredient_id = m.canonical_id
  from ingredient_merge_map m where t.ingredient_id = m.loser_id;
update public.finished_product_recipes t set ingredient_id = m.canonical_id
  from ingredient_merge_map m where t.ingredient_id = m.loser_id;
update public.production_run_consumptions t set ingredient_id = m.canonical_id
  from ingredient_merge_map m where t.ingredient_id = m.loser_id;
update public.production_run_reported_consumptions t set ingredient_id = m.canonical_id
  from ingredient_merge_map m where t.ingredient_id = m.loser_id;
update public.procurement_budget_lines t set ingredient_id = m.canonical_id
  from ingredient_merge_map m where t.ingredient_id = m.loser_id;
update public.bsj_import_staging t set ingredient_id = m.canonical_id
  from ingredient_merge_map m where t.ingredient_id = m.loser_id;
update public.finished_product_import_staging t set ingredient_id = m.canonical_id
  from ingredient_merge_map m where t.ingredient_id = m.loser_id;
update public.stock_opname_entries t set ingredient_id = m.canonical_id
  from ingredient_merge_map m where t.ingredient_id = m.loser_id;
update public.product_import_staging t set ingredient_id = m.canonical_id
  from ingredient_merge_map m where t.ingredient_id = m.loser_id;
update public.ingredient_opname_section_items t set ingredient_id = m.canonical_id
  from ingredient_merge_map m where t.ingredient_id = m.loser_id;
update public.semi_finished_items t set ingredient_id = m.canonical_id
  from ingredient_merge_map m where t.ingredient_id = m.loser_id;

update public.ingredients i set deleted_at = now()
  from ingredient_merge_map m where i.id = m.loser_id and i.deleted_at is null;

select pg_notify('pgrst', 'reload schema');
