-- Pengajuan Pembayaran sekarang bisa gabung BANYAK hutang sekaligus (boleh
-- lintas supplier) dalam SATU pengajuan/approval -- sebelumnya cuma 1
-- purchase_id per pengajuan (arahan user 2026-09-07: "bisa dipilih mana yg
-- mau diajukan jadi bisa satu atau sekaligus banyak", + boleh campur
-- supplier berbeda). Rincian per-hutang dipindah ke tabel item terpisah;
-- baris pengajuan yang sudah ada (dari uji coba sebelum migration ini)
-- di-backfill jadi 1 item per pengajuan supaya tidak hilang.
create table public.purchase_payment_request_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  request_id uuid not null references public.purchase_payment_requests (id) on delete cascade,
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0)
);

create index purchase_payment_request_items_request_id_idx
  on public.purchase_payment_request_items (request_id);
create index purchase_payment_request_items_purchase_id_idx
  on public.purchase_payment_request_items (purchase_id);

alter table public.purchase_payment_request_items enable row level security;

create policy "Owner/staff manage payment request items of own businesses"
on public.purchase_payment_request_items for all
using (private.owns_business(business_id))
with check (private.owns_business(business_id));

-- Backfill: setiap pengajuan lama (1 purchase_id + amount) jadi 1 baris item.
insert into public.purchase_payment_request_items (business_id, request_id, purchase_id, amount)
select business_id, id, purchase_id, amount
from public.purchase_payment_requests;

alter table public.purchase_payment_requests drop column purchase_id;
