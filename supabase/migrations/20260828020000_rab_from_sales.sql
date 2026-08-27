-- RAB Pembelian disusun dari Penjualan x Resep (bukan input manual lagi).
-- procurement_budgets (dibuat migrasi sebelumnya) belum pernah punya data
-- real sama sekali -- RAB sekarang jadi turunan (sum qty order x harga
-- bahan), diganti procurement_budget_lines (per bahan, per bulan RAB target).
drop table if exists public.procurement_budgets;

create table public.procurement_budget_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  period text not null, -- Bulan RAB target 'YYYY-MM'
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  reference_period text, -- Bulan Acuan Penjualan terakhir dipakai hitung (jejak, boleh null)
  suggested_qty numeric(14, 4) not null default 0, -- hasil kalkulasi penjualan x resep (snapshot terakhir hitung ulang)
  order_qty numeric(14, 4) not null default 0, -- diketik Cost Control -- INI yang dipakai hitung RAB total
  updated_at timestamptz not null default now(),
  unique (business_id, period, ingredient_id)
);

alter table public.procurement_budget_lines enable row level security;
create policy "Owner manages procurement budget lines of own businesses"
on public.procurement_budget_lines for all
using (private.owns_business(business_id)) with check (private.owns_business(business_id));
