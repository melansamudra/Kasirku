-- Kolom "Peruntukan" untuk PO Supplier manual (20260917100000) -- terpisah
-- dari supplier_name, dipakai Owner/Finance buat lihat barang ini mau
-- dipakai buat apa/lokasi mana sebelum menyetujui (arahan user 2026-09-17,
-- lanjutan dari fitur PO Supplier). Nullable dulu karena tabelnya baru saja
-- live dan mungkin sudah ada baris tanpa kolom ini -- validasi wajib isi
-- ditegakkan di actions.ts (createManualPurchaseOrder), bukan di DB.
alter table public.manual_purchase_orders add column allocation text;
