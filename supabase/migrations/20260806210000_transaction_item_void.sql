alter table transaction_items
  add column if not exists voided boolean not null default false,
  add column if not exists void_reason text,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references cashiers(id);
