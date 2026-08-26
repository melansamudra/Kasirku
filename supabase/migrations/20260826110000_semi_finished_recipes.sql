-- BOM (bill of materials) berjenjang untuk bahan setengah jadi: satu resep
-- boleh berisi bahan baku (ingredients) DAN/ATAU bahan setengah jadi lain
-- (mis. "Ayam Ungkep" pakai "Bumbu Dasar Kuning" + ayam fillet langsung).
-- `qty` didefinisikan PER 1 UNIT OUTPUT dari semi_finished_item_id (parent) —
-- bukan per batch resep — supaya kalkulasi produksi tinggal kalikan qty
-- diproduksi, tanpa perlu field "hasil per batch" terpisah.
--
-- component_semi_finished_id pakai `on delete restrict` (beda dari pola
-- purchase_request_items yang `set null`) karena ini referensi antar MASTER
-- DATA (resep), bukan riwayat transaksi — kalau dibolehkan `set null`, BOM
-- bisa diam-diam rusak (komponen hilang tanpa jejak) saat seseorang
-- menghapus item yang ternyata masih dipakai sebagai komponen resep lain.
-- Deteksi siklus tidak langsung (A pakai B, B pakai A) TIDAK bisa dijamin
-- lewat constraint SQL biasa — divalidasi di application layer
-- (addRecipeComponent di semi-finished-items/actions.ts) dan dijaga ulang
-- oleh guard `visited` di compute-cost.ts supaya tidak infinite loop kalau
-- lolos validasi manapun.

create table public.semi_finished_recipes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  semi_finished_item_id uuid not null references public.semi_finished_items (id) on delete cascade,
  component_type text not null check (component_type in ('ingredient', 'semi_finished')),
  ingredient_id uuid references public.ingredients (id) on delete restrict,
  component_semi_finished_id uuid references public.semi_finished_items (id) on delete restrict,
  qty numeric(12, 4) not null check (qty > 0),
  unit text not null,
  created_at timestamptz not null default now(),
  constraint semi_finished_recipes_component_ref_chk check (
    (component_type = 'ingredient' and ingredient_id is not null and component_semi_finished_id is null)
    or
    (component_type = 'semi_finished' and component_semi_finished_id is not null and ingredient_id is null)
  ),
  constraint semi_finished_recipes_no_self_ref
    check (component_semi_finished_id is null or component_semi_finished_id <> semi_finished_item_id)
);

create index semi_finished_recipes_item_id_idx on public.semi_finished_recipes (semi_finished_item_id);
create index semi_finished_recipes_component_id_idx on public.semi_finished_recipes (component_semi_finished_id);
create index semi_finished_recipes_ingredient_id_idx on public.semi_finished_recipes (ingredient_id);

alter table public.semi_finished_recipes enable row level security;

create policy "Owner manages semi finished recipes of own businesses"
on public.semi_finished_recipes for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
