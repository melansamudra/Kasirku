-- Fitur Mirror Accounts: memungkinkan pemilik mengundang akun read-only
-- (akuntan/auditor) untuk melihat data bisnis sesuai permission yang diberikan.

-- Kolom mirroring_enabled di businesses (diaktifkan per-bisnis oleh admin) ----

alter table public.businesses
  add column if not exists mirroring_enabled boolean not null default false;

-- Tabel mirror_accounts -------------------------------------------------------
-- Satu baris per undangan. status: 'pending' → user belum set password,
-- 'active' → sudah login dan diaktifkan otomatis saat pertama buka mirror-view.

create table public.mirror_accounts (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  invited_email  text not null,
  status         text not null default 'pending' check (status in ('pending', 'active')),
  permissions    jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index mirror_accounts_business_id_idx on public.mirror_accounts (business_id);
create index mirror_accounts_user_id_idx    on public.mirror_accounts (user_id);

-- Satu email hanya bisa punya satu akun mirror per bisnis
create unique index mirror_accounts_business_email_key
  on public.mirror_accounts (business_id, invited_email);

alter table public.mirror_accounts enable row level security;

-- Pemilik bisnis bisa CRUD semua mirror accounts miliknya
create policy "owner manages mirror accounts"
  on public.mirror_accounts for all
  using  (private.owns_business(business_id))
  with check (private.owns_business(business_id));

-- Mirror user hanya bisa baca row miliknya sendiri
create policy "mirror user reads own row"
  on public.mirror_accounts for select
  using (user_id = auth.uid());

-- Tabel mirror_selections (lama — per-akun pilihan transaksi) -----------------
-- Tidak dipakai lagi di UI baru (digantikan mirror_visible_transactions),
-- tapi tetap ada untuk backward-compat dan tidak menimbulkan error.

create table if not exists public.mirror_selections (
  mirror_account_id uuid not null references public.mirror_accounts (id) on delete cascade,
  transaction_id    uuid not null references public.transactions (id) on delete cascade,
  business_id       uuid not null references public.businesses (id) on delete cascade,
  primary key (mirror_account_id, transaction_id)
);

alter table public.mirror_selections enable row level security;

create policy "owner manages mirror selections"
  on public.mirror_selections for all
  using  (private.owns_business(business_id))
  with check (private.owns_business(business_id));
