-- Riwayat batch produksi bahan setengah jadi. `total_cost`/`unit_cost` &
-- baris production_run_consumptions adalah SNAPSHOT (harga bahan saat batch
-- itu dibuat) — tidak ikut berubah lagi kalau harga bahan baku/resep berubah
-- belakangan, persis peran transaction_items.cost di jalur POS. HPP "saat
-- ini" (untuk halaman resep) tetap dihitung live, terpisah dari tabel ini.
--
-- produced_by_employee_id merujuk ke `employees` yang sudah ada (dipakai
-- juga oleh Permintaan Barang) — bukan tabel staff baru, sesuai catatan di
-- migration employees: entitas ini memang untuk staf yang tidak pegang kasir
-- (mis. tim produksi/dapur).

create table public.production_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  semi_finished_item_id uuid references public.semi_finished_items (id) on delete set null,
  item_name text not null,
  qty_produced numeric(12, 4) not null check (qty_produced > 0),
  unit text not null,
  total_cost numeric(14, 2) not null default 0,
  unit_cost numeric(14, 4) not null default 0,
  produced_by_employee_id uuid references public.employees (id) on delete set null,
  produced_by_name text not null,
  note text,
  voided boolean not null default false,
  voided_at timestamptz,
  void_reason text,
  produced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index production_runs_business_id_idx on public.production_runs (business_id, produced_at desc);
create index production_runs_item_id_idx on public.production_runs (semi_finished_item_id);

alter table public.production_runs enable row level security;

create policy "Owner manages production runs of own businesses"
on public.production_runs for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Rincian per komponen yang dikonsumsi satu batch produksi — supaya breakdown
-- biaya batch lama tetap bisa dilihat persis walau resep/harga sudah berubah.
create table public.production_run_consumptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  production_run_id uuid not null references public.production_runs (id) on delete cascade,
  component_type text not null check (component_type in ('ingredient', 'semi_finished')),
  ingredient_id uuid references public.ingredients (id) on delete set null,
  semi_finished_item_id uuid references public.semi_finished_items (id) on delete set null,
  component_name text not null,
  qty_consumed numeric(12, 4) not null,
  unit text not null,
  unit_cost_at_time numeric(12, 4) not null,
  subtotal_cost numeric(14, 2) not null,
  created_at timestamptz not null default now()
);

create index production_run_consumptions_run_id_idx on public.production_run_consumptions (production_run_id);

alter table public.production_run_consumptions enable row level security;

create policy "Owner manages production run consumptions of own businesses"
on public.production_run_consumptions for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
