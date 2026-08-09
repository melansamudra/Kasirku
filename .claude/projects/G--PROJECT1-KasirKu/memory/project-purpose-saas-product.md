---
name: project-purpose-saas-product
description: "KasirKu is being built as a product to sell/distribute to other businesses, not for the developer's own personal use"
metadata: 
  node_type: memory
  type: project
  originSessionId: 8e69bf51-0851-4034-a940-3ce164e88520
---

KasirKu is being developed as a SaaS-style product to be sold to other business owners (pelaku usaha) — it is not for the developer's (Melan's) own personal store. Confirmed 2026-07-08: Melan had never created an owner account in the app himself; his role is building/selling the system, not operating a store with it. Melan signed up his first real account (m.khamdannn91@gmail.com) via `/signup` on 2026-07-09, but purely to be seeded as the superadmin for `/admin` — not to operate a store. See [[supabase-migrations-manual]] for the admin seeding details.

**Why:** changes the frame for future work — onboarding/signup flow, pricing/subscription, multi-tenant admin oversight, and marketing/landing pages matter here in a way they wouldn't for a single-owner internal tool.

**How to apply:** when working on auth, onboarding, or the root "/" experience, remember the audience is prospective *customers* signing up for the first time, not one known owner. **Update 2026-07-12 — the launch-readiness gaps below are now closed, see [[billing-midtrans]] for the biggest one:**
- `/` (`src/app/page.tsx`) is a real public marketing landing page (hero, feature grid, business-type pitch, CTA to `/signup`) — it does NOT redirect to `/dashboard`. Only redirects logged-in users away from it.
- `/admin` (superadmin panel, read-only tenant overview) has existed since 2026-07-08.
- Billing/subscription/plan-gating now exists — see [[billing-midtrans]]. A new business must pick and pay a plan before the dashboard/POS unlocks; no trial.
- Still true as a real gap: no pricing page, and prices are placeholder constants in `src/lib/billing/plans.ts` (not reviewed for real-world pricing yet).
- Still true: ToS/Privacy (`/terms`, `/privacy`) are explicitly marked as drafts not reviewed by a lawyer or checked against UU PDP — flag if asked about legal readiness.

**Known architectural gap, explicitly declined for now (2026-07-12)**: KasirKu has **no offline support** — every page (POS included) depends entirely on a live connection to Supabase, no local cache/queue/service-worker. User asked directly; told this is a large undertaking (local storage, sync queue, conflict resolution) and deliberately not started, only flagged as a possible mid-term item if it becomes a real complaint from users whose wifi drops mid-service.

**Post-launch punch list still open**: (1) auto-notify a customer (WhatsApp/email) when their subscription gets manually activated via `/admin`'s "Tandai Sudah Bayar" — proposed, user hadn't decided yet as of 2026-07-12; (2) the onboarding gap where `createBusiness` doesn't hard-limit one business per account server-side (only the UI redirect discourages a second) — flagged, not fixed, needs a decision on whether multi-business-per-account should be a real feature; (3) Sentry/error-monitoring — recommended, user said to revisit later, not started, no account created yet.
