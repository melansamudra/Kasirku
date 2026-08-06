alter table transactions
  add column if not exists order_label text,
  add column if not exists customer_name text;
