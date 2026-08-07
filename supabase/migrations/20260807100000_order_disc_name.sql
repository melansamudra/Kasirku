-- Simpan nama promo yang dipilih kasir saat checkout agar tercetak di struk.
alter table transactions
  add column if not exists order_disc_name text default null;
