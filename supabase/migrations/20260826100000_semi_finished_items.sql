-- Modul Cost Control (Produksi & Distribusi) — bahan setengah jadi yang
-- dibuat sendiri oleh tim produksi (mis. "Bumbu Dasar Kuning", "Ayam Ungkep")
-- sebelum dirakit jadi produk jadi atau dikirim ke outlet. Sengaja TERPISAH
-- dari `ingredients`/`products` yang dipakai jalur POS/checkout — supaya
-- tidak menyentuh sama sekali logika inti yang dipakai semua bisnis lain.
-- Tidak ada kolom cost di sini: HPP dihitung LIVE dari resep
-- (semi_finished_recipes) lewat src/lib/cost-control/compute-cost.ts, bukan
-- disimpan sebagai kolom cache, supaya BOM berjenjang tidak butuh rantai
-- recalculation trigger.

create table public.semi_finished_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  unit text not null,
  stock numeric(12, 2) not null default 0,
  min_stock numeric(12, 2) not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index semi_finished_items_business_id_idx on public.semi_finished_items (business_id);

create trigger semi_finished_items_set_updated_at
  before update on public.semi_finished_items
  for each row execute function private.set_updated_at();

alter table public.semi_finished_items enable row level security;

create policy "Owner manages semi finished items of own businesses"
on public.semi_finished_items for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
