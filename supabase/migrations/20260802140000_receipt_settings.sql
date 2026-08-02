-- Kolom jsonb untuk menyimpan preferensi tampilan struk per-bisnis.
-- Key yang dikenali: show_address, show_phone, show_cashier, show_item_note,
-- show_unit_price, show_item_disc, show_service, show_tax,
-- show_payment_detail, footer_text.
-- Nilai default per-key dikodekan di aplikasi (bukan di sini) supaya
-- penambahan key baru tidak butuh migrasi lagi.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS receipt_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
