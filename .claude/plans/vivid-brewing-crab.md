# Adi's Culinary — Website + Multi-Branch POS

## Context

Greenfield project (directory is currently empty). Goal: a public restaurant website plus an internal multi-branch POS system for Adi's Culinary, with two roles only:

- `SUPER_ADMIN` — full control: branches, menu/pricing, users, real financial reports across all branches.
- `CASHIER` — locked to one `branch_id`, operates only the POS screen (menu/variants, order type, payment method, print).

A third role from the original spec (`TAX_AUDIT`, with "adjusted/reduced" transaction exports for tax filing) was **rejected and dropped** — it described maintaining a second, systematically-reduced set of books specifically for tax reporting, which is tax fraud, not a legitimate reporting feature. Nothing in this plan produces manipulated financial exports. Reports always reflect real transaction data.

Printing requirement was refined in conversation: kitchen/bar tickets print over **LAN** to thermal printers; customer receipts print over **Bluetooth** directly from the cashier's browser. Browsers can't open raw TCP sockets, so LAN printing needs a small local helper process; Bluetooth printing can talk to the printer directly via the Web Bluetooth API with no helper needed. A `window.print()` / `@media print` fallback (58mm/80mm) is kept as a resilience layer per the original spec.

## Tech Stack

Next.js (App Router, TypeScript) · Tailwind CSS + shadcn/ui + lucide-react · Supabase (Postgres, Auth, RLS) · Zustand (POS cart) · a shared ESC/POS byte-builder package · a small standalone Node "print agent" for LAN printers.

## Repo Structure

npm workspaces monorepo (no extra tooling to install beyond Node/npm):

```
package.json                    # "workspaces": ["apps/*", "packages/*"]
apps/
  web/                           # Next.js app
    middleware.ts
    app/
      (public)/                 # home, menu, branches, contact — anon-readable
      (auth)/login/
      pos/                      # CASHIER + SUPER_ADMIN
        page.tsx                # menu grid + cart
        checkout/page.tsx
        receipt/[orderId]/page.tsx   # printable view (window.print fallback)
      admin/                    # SUPER_ADMIN only
        branches/ menu/ users/ printers/ reports/
    lib/
      supabase/{client,server,middleware,types}.ts
      pos/{cart-store,printer-discovery,order-actions}.ts
      print/{agent-client,bluetooth-client,receipt-templates}.ts
      auth/roles.ts
    components/{ui,pos,admin,print}/
    styles/{globals.css,print.css}
  print-agent/                  # standalone Node service, runs on cashier PC
    src/{server.ts,printSocket.ts,config.ts}
packages/
  escpos/                       # shared ESC/POS byte builder (used by web + print-agent)
supabase/
  migrations/
  seed.sql
```

`packages/escpos` exists because both print paths (LAN via agent, Bluetooth via browser) must emit identical ESC/POS byte sequences — one builder, no drift.

## Database Schema

Enums: `user_role (SUPER_ADMIN, CASHIER)`, `order_type (DINE_IN, TAKEAWAY)`, `payment_method (CASH, QRIS)`, `order_status (OPEN, COMPLETED, VOID)`, `print_station (KITCHEN, BAR, NONE)`, `paper_size (58MM, 80MM)`.

Tables: `branches`, `profiles` (FK to `auth.users`, `role`, nullable `branch_id`, check constraint requiring `branch_id` when role is `CASHIER`), `categories` (global catalog, has `default_print_station`), `menu_items` (FK category, optional `print_station` override), `menu_item_variants` (price lives here, not on the item), `orders` (`branch_id`, `cashier_id`, `order_number`, totals as `numeric(12,2)`), `order_items` (denormalized `branch_id` for simple RLS + reporting index; **snapshots** `item_name`/`variant_name`/`unit_price` at sale time so later price/menu edits never retroactively change historical reports), `printers` (`branch_id`, `station`, `ip_address`, `port`), `receipt_settings` (`branch_id` PK, store info, `paper_size`, `tax_rate`).

Key indexes: `orders(branch_id, created_at desc)` and `order_items(branch_id, created_at desc)` for the reporting query pattern; unique `(branch_id, order_number)`.

Voiding a completed order is a real, legitimate POS operation — allowed only for `SUPER_ADMIN`, tracked with `voided_at`/`voided_by`/`void_reason`, and always shown as a visible line in reports (never silently excluded). This is intentionally different from the rejected tax-manipulation pattern: it's a rare, attributed, auditable correction, not a systemic reporting substitution.

## RLS Design

Use `security definer` helper functions (`auth_role()`, `auth_branch_id()`, `is_super_admin()`) reading `profiles` by `auth.uid()` — required to avoid RLS-recursion when a policy on `profiles` needs to read `profiles`.

Pattern per table: `SUPER_ADMIN` bypasses via `is_super_admin()`; `CASHIER` restricted to `branch_id = auth_branch_id()`. Cashiers get **insert-only** on `orders`/`order_items` (no update/delete policy at all) — they can create sales but cannot alter or erase a completed one; only `SUPER_ADMIN` can update (e.g. to void). `categories`/`menu_items`/`menu_item_variants` are readable by everyone (including `anon`, filtered to `is_active = true`, for the public menu page) and writable only by `SUPER_ADMIN`.

Order creation goes through one `security invoker` RPC (`create_order`) so RLS still applies per-caller even though it's a function — a cashier can't be tricked into cross-branch inserts. The RPC also **recomputes `print_station` server-side** from `menu_items`/`categories` rather than trusting the client cart, so a tampered client can't misroute kitchen tickets.

## Auth & Routing

Use a Supabase Auth Hook (`custom_access_token_hook`) to embed `user_role` and `branch_id` directly into the JWT at token mint time, so `middleware.ts` reads role from the already-verified session token with no extra DB round-trip per request. Middleware redirects: public marketing paths unauthenticated; `/admin/**` requires `user_role = SUPER_ADMIN`; `/pos/**` requires `SUPER_ADMIN` or `CASHIER`. Middleware is UX-only routing — RLS remains the real security boundary in case Supabase is hit directly.

No public self-signup: `SUPER_ADMIN` creates cashier accounts via the Supabase Admin API (service-role key, server-side only, never exposed to the client) in `/admin/users`.

## POS Flow

Zustand `cart-store.ts` holds cart lines client-side only (in-memory, not persisted to `localStorage` — a stale cart reappearing after a shift change is a real bug class to avoid). On "Complete Order": call `create_order` RPC → clear cart on success (sale is committed regardless of what happens next) → fetch the order's items grouped by `print_station` → send each non-empty group to the LAN print agent → attempt the Bluetooth receipt print if a printer is already paired → show the on-screen confirmation/receipt page, which doubles as the `window.print()` fallback surface.

**Printing is always best-effort and independently retryable — a print failure never blocks or rolls back an order.** Every print step gets a manual "Reprint" action on the confirmation screen driven by re-fetching that `order_id`'s items.

## LAN Print Agent

Standalone Node service (`apps/print-agent`), bound to `127.0.0.1` only (never `0.0.0.0`), with a strict CORS origin allow-list. Contract: `POST /print { ip, port, bytes(base64) }` opens a raw TCP socket to the printer's `ip:port` (typically 9100) and writes the ESC/POS bytes; `GET /health` for a quick liveness check. `printer-discovery.ts` looks up the branch's active printer row per station before each print call. If the agent isn't reachable or the printer socket errors, surface a non-blocking toast with retry — never a hard failure on the order itself. Packaged later as a small executable (`pkg`/Node SEA) cashiers can add to Windows startup; out of scope for the initial build to write an installer, just a runnable script + README first.

## Bluetooth Receipt Path

Web Bluetooth (Chrome/Edge only, requires HTTPS or localhost and a user gesture for first pairing). Use `navigator.bluetooth.getDevices()` to silently reconnect to a previously-granted printer on POS load; fall back to `requestDevice()` only when none is found (e.g. a "Pair Printer" button in a per-station settings panel). Chunk writes to **20 bytes** (the safe universal BLE ATT MTU floor) via `writeValueWithoutResponse`, with a small delay between chunks. The browser's own permission grant is the real source of truth for "is this printer paired" — no server-side storage of Bluetooth pairing; at most cache the expected device name client-side for convenience.

## Build Phases (in order)

1. **Schema + RLS** — all tables/enums, helper functions, policies, the JWT auth hook. Verify by inserting/selecting as different test roles directly in Supabase Studio.
2. **Auth + middleware + admin branch/user CRUD** — enough to create one `SUPER_ADMIN`, one branch, one `CASHIER` for downstream testing.
3. **Menu management (admin)** — categories → items → variants CRUD, since POS needs real menu data.
4. **POS UI + cart + order submission** — full order flow via `create_order`, no printing hardware needed to test.
5. **Printable receipt fallback** — `/pos/receipt/[orderId]` + `print.css` for 58mm/80mm, testable with plain `window.print()` preview, no hardware required.
6. **LAN print agent + kitchen/bar tickets** — `packages/escpos`, the agent service, `/admin/printers` CRUD, POS integration. Can test against a raw TCP listener (e.g. netcat on port 9100) before real hardware.
7. **Bluetooth customer receipt** — reuses `packages/escpos` from phase 6; independent of the LAN path.
8. **Admin reports dashboard** — real per-branch/date sales totals against `orders`/`order_items`, no adjustment controls anywhere.
9. **Public marketing website** — home/menu/branches/contact, reading the same catalog tables via `anon` RLS. No dependency on phases 2–8 beyond the shared schema; lowest risk, can shift to last.

Phases 6 and 7 can run in parallel once phase 4 is stable. Phase 9 could move earlier if marketing needs outpace POS rollout.

## Verification

- After phase 1: run through RLS as each role in Supabase Studio's SQL editor (`set role authenticated; set request.jwt.claims...`) to confirm cross-branch reads/writes are actually blocked.
- After phase 2–4: manually log in as the seeded `CASHIER`, confirm redirect to `/pos` only and branch-scoped menu/order data; log in as `SUPER_ADMIN`, confirm `/admin` access and cross-branch visibility.
- After phase 4: complete a full order end-to-end and confirm `orders`/`order_items` rows land with correct `branch_id`, snapshots, and computed totals/tax.
- After phase 5: trigger `window.print()` on the receipt page and check the print preview renders correctly at both 58mm and 80mm widths.
- After phase 6: point a test printer entry at a local `nc -l 9100` (or real thermal printer) and confirm bytes arrive; kill the print-agent process and confirm the order still completes with a retry toast instead of a hard error.
- After phase 7: pair a real BLE thermal printer in Chrome/Edge and confirm a receipt prints without dropped bytes; reload the page and confirm silent reconnect via `getDevices()`.
- After phase 8–9: spot-check that reported totals match a manual sum of seeded test orders, and that the public menu page shows only `is_active = true` items with no auth.
