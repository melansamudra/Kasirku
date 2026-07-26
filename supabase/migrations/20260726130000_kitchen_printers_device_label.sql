-- Nullable, no backfill: existing rows keep rendering by their raw address
-- (unchanged UI behavior) until re-saved through the native Bluetooth device
-- picker in the Android app, which fills this with the paired device's
-- friendly name alongside the real MAC address in `address`.
alter table public.kitchen_printers add column device_label text;
