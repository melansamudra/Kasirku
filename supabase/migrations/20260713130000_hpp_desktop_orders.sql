-- Kalkulator HPP desktop app — one-time-sale product, guest checkout (no
-- KasirKu account/business involved at all). Deliberately a separate table
-- from public.payments/public.subscriptions (both tied to business_id) —
-- see billing (20260712110000_billing.sql) for that system, which this does
-- not touch or reuse beyond the same Midtrans webhook endpoint (branched by
-- order_id prefix, see src/app/api/midtrans/notification/route.ts).
--
-- RLS is enabled with NO policies at all — not even a narrow insert policy
-- like payments has. There is no authenticated session in this flow (no
-- business owner to check via private.owns_business), so every write goes
-- through the service-role client (src/lib/supabase/service.ts) from Server
-- Actions/the webhook, which bypasses RLS entirely. Anonymous buyers check
-- their own order status only through the get_hpp_order_status() RPC below
-- (by order_id, not by scanning the table).
create table public.hpp_desktop_orders (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique,
  email text not null,
  amount numeric(14, 2) not null check (amount > 0),
  status text not null default 'pending'
    check (status in ('pending', 'settlement', 'expire', 'cancel', 'deny')),
  download_token uuid,
  midtrans_transaction_id text,
  payment_type text,
  raw_notification jsonb,
  created_at timestamptz not null default now()
);

alter table public.hpp_desktop_orders enable row level security;

-- download_token only surfaces once the order has actually settled — a
-- buyer polling this right after "Beli Sekarang" (before Midtrans confirms)
-- gets status='pending' and a null token, not a guessable early token.
create or replace function public.get_hpp_order_status(p_order_id text)
returns table (status text, download_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select o.status, case when o.status = 'settlement' then o.download_token else null end
  from public.hpp_desktop_orders o
  where o.order_id = p_order_id;
end;
$$;

grant execute on function public.get_hpp_order_status(text) to anon, authenticated;
