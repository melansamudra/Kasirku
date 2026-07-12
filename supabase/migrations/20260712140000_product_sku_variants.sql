-- Lightweight SKU + product variants (see [[mini-erp-scope]]-style scoping:
-- variants are just extra product rows sharing the same name, grouped in the
-- UI by variant_label — no changes needed to checkout_transaction, HPP, or
-- reporting, since every variant is still a fully independent product row
-- with its own stock/price/cost.
alter table public.products
  add column sku text,
  add column variant_label text;

-- SKU only needs to be unique among live (non-deleted) products of a business,
-- same pattern as the existing barcode uniqueness index.
create unique index products_business_id_sku_key
  on public.products (business_id, sku)
  where sku is not null and deleted_at is null;
