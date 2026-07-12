-- Mini-ERP: rekonsiliasi rekening kas/bank. Snapshot-only tool — bandingkan
-- saldo menurut jurnal (buku) vs saldo menurut rekening koran/kas fisik pada
-- suatu tanggal, simpan selisihnya sebagai riwayat. Tidak mengubah jurnal
-- sama sekali (beda dari Transfer Kas/Bank yang memposting entri) — murni
-- alat diagnosa, jadi cukup insert langsung dari client seperti fixed_assets,
-- tanpa RPC security-definer.
create table public.account_reconciliations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  statement_date date not null,
  book_balance numeric(14, 2) not null,
  statement_balance numeric(14, 2) not null,
  difference numeric(14, 2) not null,
  note text,
  created_at timestamptz not null default now()
);

create index account_reconciliations_business_account_idx
  on public.account_reconciliations (business_id, account_id, statement_date desc);

alter table public.account_reconciliations enable row level security;

create policy "Owner manages account reconciliations of own businesses"
on public.account_reconciliations for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));
