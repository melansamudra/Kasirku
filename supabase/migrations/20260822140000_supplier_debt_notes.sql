-- Nota Hutang: kasir catat nota supplier yang datang secara hutang (belum
-- dibayar) -- murni catatan, tidak posting apa pun ke jurnal/stok/utang.
-- Admin memverifikasi lalu dialihkan (link ter-prefill) ke halaman
-- "Pembelian & Hutang" yang sudah ada -- di situ baru resmi tercatat sebagai
-- pembelian (update stok, Utang Dagang, dst). Sama persis pola "Permintaan
-- Barang -> Catat sebagai Pembelian".

create table public.supplier_debt_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  -- Kalau supplier belum terdaftar, kasir boleh ketik nama manual di sini
  -- daripada diblokir input notanya.
  supplier_name_manual text,
  category text not null check (category in ('Bahan Baku', 'Bukan Bahan Baku')),
  amount numeric(12, 2) not null check (amount > 0),
  note text,
  receipt_url text,
  origin text not null default 'kasir' check (origin in ('kasir', 'admin')),
  shift_id uuid references public.shifts (id) on delete set null,
  cashier_id uuid references public.cashiers (id) on delete set null,
  created_by_user_id uuid references auth.users (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'verified')),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint supplier_debt_notes_supplier_chk check (
    supplier_id is not null or supplier_name_manual is not null
  )
);

create index supplier_debt_notes_business_id_status_idx on public.supplier_debt_notes (business_id, status);

alter table public.supplier_debt_notes enable row level security;

create policy "Owner manages supplier debt notes of own businesses"
on public.supplier_debt_notes for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
