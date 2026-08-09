# Billing: Midtrans subscription + lifetime purchase

## Context

KasirKu is meant to be sold to other business owners, but right now there is
**no way for anyone to pay** — no plan/subscription columns anywhere, no
payment gateway, no way to lock out a non-paying tenant (confirmed via a full
codebase audit: `businesses` table has zero billing columns, `/admin` is
read-only, `package.json` has no payment SDK). This is the launch blocker.
The user wants:

- Two kinds of paid plans: recurring **subscription** (bulanan/tahunan) and
  a **sekali-beli (lifetime)** one-time purchase.
- **Midtrans** as the gateway.
- **No trial** — a new business must pick and pay for a plan immediately
  after signup, before the dashboard is usable at all.
- On a subscription lapsing, a **grace period** (3 days) with a warning
  banner before the account is actually locked out.

Scope for this pass is "get a working, secure payment loop live fast," not a
full billing back-office. Plan prices are placeholders in code — the user
must edit them before going live; I have no real pricing input.

## Data model

New migration `supabase/migrations/<ts>_billing.sql`:

```sql
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses (id) on delete cascade,
  plan_code text not null,                 -- matches PLANS[].code in src/lib/billing/plans.ts
  status text not null default 'unpaid'
    check (status in ('unpaid', 'active', 'past_due', 'expired')),
  period_end timestamptz,                  -- null = lifetime / never expires
  updated_at timestamptz not null default now()
);
-- one row per business, mutated in place (mirrors how `businesses` itself works)

alter table public.subscriptions enable row level security;
create policy "Owner reads own subscription"
on public.subscriptions for select
using (private.owns_business(business_id));
-- no insert/update/delete policy for authenticated users: only the
-- service-role webhook and the cron sweep write to this table.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  plan_code text not null,
  order_id text not null unique,           -- sent to Midtrans as order_id
  amount numeric(14, 2) not null,
  status text not null default 'pending'
    check (status in ('pending', 'settlement', 'expire', 'cancel', 'deny')),
  midtrans_transaction_id text,
  payment_type text,
  raw_notification jsonb,
  created_at timestamptz not null default now()
);
create index payments_business_id_idx on public.payments (business_id, created_at desc);
alter table public.payments enable row level security;
create policy "Owner reads own payments"
on public.payments for select
using (private.owns_business(business_id));
create policy "Owner creates own pending payments"
on public.payments for insert
with check (private.owns_business(business_id) and status = 'pending');
-- updates to payments (settlement/expire/etc) only ever come from the
-- service-role webhook, which bypasses RLS — no update policy for
-- authenticated users.
```

Plan catalog lives in code, not the DB (fastest to ship; revisit if pricing
needs to change without a deploy):

`src/lib/billing/plans.ts`
```ts
export type PlanCode = "monthly" | "yearly" | "lifetime";
export const PLANS: {
  code: PlanCode; name: string; kind: "subscription" | "lifetime";
  periodDays: number | null; price: number;
}[] = [
  { code: "monthly", name: "Langganan Bulanan", kind: "subscription", periodDays: 30, price: 99000 },
  { code: "yearly", name: "Langganan Tahunan", kind: "subscription", periodDays: 365, price: 990000 },
  { code: "lifetime", name: "Sekali Bayar (Lifetime)", kind: "lifetime", periodDays: null, price: 2500000 },
];
```
(placeholder prices — flag clearly in the PR/summary that these must be edited)

## Shared status helper

`src/lib/billing/status.ts` — `getSubscriptionAccess(supabase, businessId)`
returns `{ locked: boolean; status: string; periodEnd: string | null }`.
Reads the `subscriptions` row for the business (none yet = `unpaid` =
`locked: true`). `locked` is true for `unpaid` and `expired`; false for
`active` and `past_due` (past_due only shows a warning, per the grace-period
decision). Used by both gating layouts below so the rule lives in one place.

## Enforcement (two independent layouts, no shared cross-cutting layout)

Next.js layouts can't easily detect "am I currently rendering the billing
page itself" from a parent layout, so instead of one `[businessId]/layout.tsx`
wrapping everything (which would redirect-loop on `/billing`), gate at the
two existing entry points that are NOT the billing page:

- **`src/app/business/[businessId]/(dashboard)/layout.tsx`** (exists today,
  reads `business` + `userData`) — add `getSubscriptionAccess` to the same
  `Promise.all`, `redirect()` to `/business/${businessId}/billing` if
  `locked`. If `status === 'past_due'`, pass a warning flag into
  `DashboardShell` to render a dismissible-for-the-session banner ("Langganan
  jatuh tempo, bayar sebelum <periodEnd> agar tidak terkunci" + link to
  `/billing`).
- **`src/app/business/[businessId]/pos/layout.tsx`** (new file — pos has no
  layout today) — same `getSubscriptionAccess` redirect, no banner needed
  (cashiers don't need to see billing state, only the owner browsing the
  dashboard does).

`/order/*` (customer-facing self-order QR flow) is untouched — it's already
outside `/business/[businessId]` entirely per the middleware's public-path
list, so customers are never blocked by the owner's billing status.

## Billing page

`src/app/business/[businessId]/billing/page.tsx` (sibling to `(dashboard)`
and `pos`, so neither gating layout wraps it):
- Shows current status (from `getSubscriptionAccess`) and, if a subscription,
  the current `period_end`.
- Lists `PLANS` as cards with a "Bayar Sekarang" button per plan.
- `billing/actions.ts` → `createPayment(businessId, planCode)` server action:
  inserts a `payments` row (`status='pending'`, `order_id` =
  `KK-${businessId.slice(0,8)}-${Date.now()}`), calls Midtrans Snap
  (`POST https://app.midtrans.com/snap/v1/transactions`, Sandbox host in
  dev via `MIDTRANS_IS_PRODUCTION`) with Basic auth using
  `MIDTRANS_SERVER_KEY`, gets back `redirect_url`, returns it to the client.
- `billing/pay-button.tsx` (client component): calls the action, then
  `window.location.href = redirectUrl` — plain redirect to Midtrans's hosted
  Snap page, no Snap.js popup SDK needed (keeps this consistent with the
  app's existing preference for server-rendered flows over client JS).
- After Midtrans payment, it redirects the browser back to a `finish` URL
  (e.g. `/business/${businessId}/billing?status=selesai`) — cosmetic only,
  not authoritative (the webhook is authoritative).

## Onboarding change

`src/app/onboarding/actions.ts` `createBusiness` currently redirects to
`/dashboard` after insert. Change: also insert a `subscriptions` row
(`status='unpaid'`, `plan_code=null` or a sentinel) for the new business,
then redirect to `/business/${id}/billing` instead of `/dashboard` — no
trial, so the very first thing a new owner sees is the plan picker.

## Midtrans webhook (new pattern: first service-role client in this codebase)

`src/app/api/midtrans/notification/route.ts` (new Route Handler, `POST`):
- Reads JSON body (`order_id`, `status_code`, `gross_amount`,
  `signature_key`, `transaction_status`, `payment_type`, `transaction_id`).
- Verifies `sha512(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY) === signature_key`
  (Midtrans's documented scheme) — reject with 401 if it doesn't match.
- Uses a **service-role** Supabase client (new: `src/lib/supabase/service.ts`,
  `createClient` with `SUPABASE_SERVICE_ROLE_KEY`, server-only, never
  imported client-side) since there's no authenticated user session in a
  webhook — this is the only file allowed to bypass RLS.
- Looks up `payments` by `order_id`. If already `settlement` (idempotency —
  Midtrans retries notifications), return 200 no-op.
- Maps `transaction_status`: `capture`/`settlement` → `payments.status =
  'settlement'`; `deny`/`cancel`/`expire` → mirror that status. Stores the
  full body in `raw_notification` for audit.
- On a fresh `settlement`: upsert `subscriptions` — `status='active'`;
  `period_end` = `null` for `lifetime`, else `now() + periodDays` (extending
  from the greater of `now()` or the existing `period_end` if renewing
  early, so early renewal doesn't lose paid-for days).
- Always returns 200 (Midtrans expects 2xx or it keeps retrying) even on a
  handled "unknown order_id" case — just skip silently, log via
  `console.error` (no activity-log table write needed for a webhook).

## Cron sweep (subscription → past_due → expired)

No cron infra exists yet (no `vercel.json`). Add:
- `vercel.json` at repo root: `{"crons": [{"path": "/api/cron/subscription-sweep", "schedule": "0 1 * * *"}]}`
  (once daily).
- `src/app/api/cron/subscription-sweep/route.ts` (`GET`): checks
  `request.headers.get("authorization") === \`Bearer ${process.env.CRON_SECRET}\``,
  403 if not (Vercel Cron sends this header when `CRON_SECRET` env var is
  set — documented Vercel behavior). Uses the service-role client:
  - `status='active' and period_end < now()` → `status='past_due'`.
  - `status='past_due' and period_end < now() - interval '3 days'` →
    `status='expired'`.
  - `lifetime` subscriptions (`period_end is null`) are never touched.

## Admin panel visibility (small extension, not a full billing back-office)

Extend `admin_list_businesses()` (migration, `create or replace function`) to
also return `subscription_status` and `plan_code` by left-joining
`subscriptions`, and add those two columns to the table in
`src/app/admin/page.tsx`. No manual-override UI in this pass — flag as a
fast-follow if the user needs to comp an account or handle an offline
bank-transfer edge case later.

## New env vars (document in `.env.example`, don't set real values)

- `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION`
  (`"true"`/`"false"`)
- `CRON_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY` already exists in `.env.example`, just unused
  today — first real use is `src/lib/supabase/service.ts`.

## Files touched (summary)

- New: `supabase/migrations/<ts>_billing.sql`, `src/lib/billing/plans.ts`,
  `src/lib/billing/status.ts`, `src/lib/supabase/service.ts`,
  `src/app/business/[businessId]/billing/{page.tsx,actions.ts,pay-button.tsx}`,
  `src/app/business/[businessId]/pos/layout.tsx`,
  `src/app/api/midtrans/notification/route.ts`,
  `src/app/api/cron/subscription-sweep/route.ts`, `vercel.json`.
- Modified: `src/app/business/[businessId]/(dashboard)/layout.tsx`,
  `src/app/business/[businessId]/(dashboard)/dashboard-shell.tsx` (banner
  prop), `src/app/onboarding/actions.ts`, `supabase/migrations/..._admin_panel`
  follow-up migration for the RPC change, `.env.example`.

## Verification

1. `npx eslint` + `npx tsc --noEmit` clean, as usual.
2. Apply the new migration via the Supabase SQL Editor (per the established
   manual-migration workflow) — confirm `subscriptions`/`payments` exist
   with RLS.
3. In the browser preview: sign up a fresh test account → confirm it lands
   on `/billing` (not `/dashboard`) with `status='unpaid'` and can't reach
   any dashboard/pos page directly by URL (redirected back to `/billing`).
4. Click "Bayar Sekarang" on the lifetime plan (Midtrans **Sandbox** mode,
   `MIDTRANS_IS_PRODUCTION=false`) → confirm redirect to Midtrans's sandbox
   Snap page, complete a test payment with Midtrans's documented test
   card/VA numbers.
5. Confirm the webhook fires (check Vercel/dev server logs, or if testing
   locally, simulate it with a signed `curl` POST matching the real payload
   shape) and `payments.status` flips to `settlement`, `subscriptions`
   flips to `active`, `period_end` set correctly for a subscription plan
   vs `null` for lifetime.
6. Confirm dashboard/POS are reachable again after payment.
7. Manually backdate a test row's `period_end` in the SQL Editor and hit the
   cron route directly (with the right `CRON_SECRET` header) to confirm the
   `active → past_due → expired` transitions and that the dashboard shows
   the grace-period banner, then locks out once `expired`.
8. Confirm `/admin` shows the new subscription columns for the test business.
