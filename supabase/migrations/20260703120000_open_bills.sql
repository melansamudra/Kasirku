-- Module 14: open bill (simpan bon). Keranjang yang ditahan per meja/pelanggan,
-- dilanjutkan atau dibayar nanti. Item disimpan sebagai snapshot jsonb —
-- open bill bersifat transien (dihapus saat dibayar) dan tidak pernah jadi
-- sumber laporan, jadi tidak perlu tabel anak. Harga di sini murni tampilan;
-- angka final selalu dihitung ulang checkout_transaction dari public.products.

create table public.open_bills (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  label text not null,
  items jsonb not null default '[]', -- [{product_id, name, price, qty, disc, disc_type}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index open_bills_business_id_idx on public.open_bills (business_id);

alter table public.open_bills enable row level security;

create policy "Owner manages open bills of own businesses"
on public.open_bills for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
