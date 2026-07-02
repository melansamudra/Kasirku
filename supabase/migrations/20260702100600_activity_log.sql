-- Module 6: activity_log — not critical for daily operations, migrated last.

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  -- Null for system-wide log entries that aren't tied to one business.
  business_id uuid references public.businesses (id) on delete cascade,
  type text not null check (type in ('transaksi', 'produk', 'sistem', 'pengaturan')),
  status text not null check (status in ('sukses', 'warning', 'info')),
  title text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index activity_log_business_id_created_at_idx on public.activity_log (business_id, created_at);

alter table public.activity_log enable row level security;

-- Rows with a null business_id are cross-business system entries — visible to
-- any authenticated owner, since there's no business to scope them to.
create policy "Owner reads activity of own businesses plus system-wide entries"
on public.activity_log for select
using (business_id is null or private.owns_business(business_id));

create policy "Owner writes activity for own businesses"
on public.activity_log for insert
with check (business_id is null or private.owns_business(business_id));
