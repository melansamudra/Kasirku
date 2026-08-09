---
name: product-roadmap-2026-07
description: "Future product/business roadmap items Melan wants tracked, added 2026-07-12 — not yet scheduled or started"
metadata: 
  node_type: memory
  type: project
  originSessionId: 497c650d-a553-4313-ba50-9af85cb62fec
---

Melan added four forward-looking roadmap items on 2026-07-12, right after a session building growth/marketing features (Google Analytics, `/rekomendasi-alat`, `/blog`, `/kalkulator-hpp` — see [[project-purpose-saas-product]] for the wider launch context). These are explicitly **not scheduled or started** — just captured so they aren't lost between sessions.

1. **Kalkulator HPP dijual terpisah** — spin off `/kalkulator-hpp` into its own standalone product/tool, not just a free lead-magnet living inside the KasirKu marketing site. Pivoted twice same day (2026-07-13): first built as a web tool with AI price recommendations ([[kalkulator-hpp-standalone]], superseded), then replaced with a one-time-sale **desktop app** ([[kalkulator-hpp-desktop]], current — no AI, no ongoing cost, Midtrans one-time payment + guest checkout). Desktop app fully redesigned (sidebar UI, dashboard charts, menu bundling, Excel import, backup) and the installer `.exe` was successfully built by the user on 2026-07-13 (Developer Mode resolved the earlier Windows permission block) — file is in `private-assets/`. Remaining before this can actually go live: apply the 2 pending Supabase migrations, set a real price (still placeholder Rp49.000), and wait for the user's Midtrans account to clear verification (currently manual-contact fallback).
2. **Sistem Finance dijual terpisah** — ✅ **DONE 2026-07-16**, see [[finance-standalone-product]]: all 10 build phases shipped (Finance Only billing plan, nav gating, Invoice/Nota, Notifikasi center, Kas Harian, standalone Rekap Absensi, synced period switcher, full Akuntansi/SDM visual reskin, `/sistem-akuntansi` marketing page, bulk Excel export). Only launch prep left (real pricing, Midtrans approval), not more build work.
3. **Redesain tampilan website** — 🚧 in progress, see [[website-redesign]]: a receipt-themed concept mockup was shown 2026-07-16 (awaiting feedback, not yet applied), plus two unrelated mobile UX fixes on the real live page already shipped (hero carousel, mobile nav menu). Note: don't confuse with the Akuntansi/SDM dashboard reskin done for item #2 above — this item is specifically about the public landing/marketing pages looking more distinctive/"nendang", a separate surface.
4. **Pisahkan Supabase produksi vs development** — ✅ **DONE 2026-07-16**, see [[supabase-dev-prod-split]]: new "KasirKu Dev" project created, all 54 migrations replayed onto it, `.env.local` now points there instead of production.

**How to apply:** don't start any of these unprompted — they're backlog, not active work. Surface them when Melan asks about roadmap/what's next, or when a request maps onto one of these four (e.g. asked to touch Supabase env setup, or to redesign the landing page).

A full status snapshot from the same day (what shipped, what's pending business decisions) was published as an Artifact — a live status ledger, not a durable memory; re-derive current state from the codebase/git rather than assuming that snapshot is still accurate in a future session.
