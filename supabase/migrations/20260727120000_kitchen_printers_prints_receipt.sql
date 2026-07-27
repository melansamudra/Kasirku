-- Marks a kitchen_printers row as the (one or more) printer(s) that should
-- auto-receive the priced customer receipt at checkout, instead of/in
-- addition to kitchen/bar tickets. See buildKitchenPrintJobs and checkout()
-- for how this flag changes routing.
alter table public.kitchen_printers
  add column prints_receipt boolean not null default false;
