---
name: supabase-dev-prod-split
description: "Separate Supabase project for local development, done 2026-07-16 — closes roadmap item #4 (prod/dev split)"
metadata: 
  node_type: memory
  type: project
  originSessionId: a6d0af07-7540-4516-bd00-24ac48a5c53b
---

Closes item #4 from [[product-roadmap-2026-07]]: local dev/experiments were previously running against the same Supabase project as real tenant data (`.env.local` pointed straight at production). Fixed 2026-07-16.

**What was done**: user created a new Supabase project **"KasirKu Dev"** (project ref `cycahgzlpgkjtxnkslze`, region `ap-northeast-2`/Seoul, Free tier, org "melansamudra's Org") via the dashboard. All 54 files in `supabase/migrations/` were applied to it in one shot using a throwaway Node script (`pg` client installed with `npm install --no-save pg`, connected via the **session pooler** — not the direct `db.<ref>.supabase.co` host, which failed DNS resolution from this network/machine; the pooler host is `aws-1-ap-northeast-2.pooler.supabase.com`, port `5432` for session mode, user `postgres.cycahgzlpgkjtxnkslze`). All 54 applied cleanly with zero errors on the first attempt — confirms the migration history has been staying consistent/replayable. Verified working via `curl` against the new project's REST API (`/rest/v1/businesses` returned 200) and by booting the dev server against it (landing page rendered logged-out, as expected — the old session cookie doesn't carry over since JWT signing is per-project).

**File layout after this change**:
- `.env.local` (Next.js auto-loads this for `next dev`/local `next build`) now points to the **Dev** project — new `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`. Non-Supabase values (Midtrans sandbox test keys, `CRON_SECRET`, GA ID, Anthropic key) carried over unchanged.
- `.env.prod-reference` (**new**, gitignored like all `.env*` files, but deliberately **not** named `.env.production.local` so Next.js never auto-loads it) holds the **real production** Supabase URL/anon/service-role keys, for the rare case a future session needs to run an admin script against real tenant data. Copy its values into `.env.local` temporarily for that one script, then revert — don't leave it swapped in.
- Vercel's deployed production app was **not touched** — its environment variables live in the Vercel dashboard, separate from this local file, and still point at the original (real) Supabase project. No downtime, no risk to the live site from this change.

**How to apply**: from now on, `npm run dev` / local testing / any future migration-writing session in this project talks to **KasirKu Dev**, not real tenant data — safe to break things locally. Any *new* migration written in a future session still needs the same manual two-step apply: paste into the **Dev** project's SQL Editor first to verify it works, then into the **production** project's SQL Editor to actually ship it (see [[supabase-migrations-manual]] — that workflow is now effectively duplicated across two projects instead of one, don't forget the second paste). If a future session needs to point local dev back at production temporarily (e.g. to debug a prod-only data issue), swap in `.env.prod-reference`'s values and swap back out when done — never leave `.env.local` pointed at production by default again.
