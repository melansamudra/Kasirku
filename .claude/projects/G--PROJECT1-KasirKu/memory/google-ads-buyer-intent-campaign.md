---
name: google-ads-buyer-intent-campaign
description: "First Google Ads account + Search campaign ('Buyer Intent' tier) created and funded 2026-07-19; second 'Edukasi' campaign still to build"
metadata: 
  node_type: memory
  type: project
  originSessionId: f00c880e-89f5-4451-9a5a-e61d5482df30
---

**2026-07-19**: Melan had no prior Google Ads account. Guided a full screenshot-by-screenshot walkthrough (no direct API/browser access to his account) creating his first account + Search campaign for KasirKu/CreateImpact.

**Result — Campaign #1 ("Buyer Intent" tier)**:
- Type: Search, targeting `/kasirku` (not the bare homepage) with 15 curated buyer-intent keywords (e.g. "kasir online gratis", "aplikasi kasir termurah") — replaced Google's auto-suggested generic industry terms ("bisnis kuliner").
- Budget: **IDR70.000/day** (custom, not Google's "Recommended" IDR182.500/day default) — deliberately lower to match the original 2-campaign plan's split (see [[growth-marketing-phase]] for the original Rp100rb/day 70/30 plan).
- Language: Indonesian only, Networks: Search partners only (Display Network removed).
- 10 headlines + 4 descriptions (Ad strength: Average, 89.6% optimization score), 6 sitelinks (Kalkulator HPP Desktop → `/kalkulator-hpp/beli`, Lihat Harga, Panduan Lengkap, Perbandingan, Sistem Akuntansi, Layanan Konsultasi).
- Bid strategy: Conversions focus, no target CPA (no historical data yet).
- Payment method: **bank transfer (manual)**, not credit card — Melan transferred funds to the Citibank virtual account manually on 2026-07-19. Funds typically confirm in 5-10 business days before ads actually start serving impressions.
- GA4 property "KasirKu" (545176220) linked into the account during onboarding.
- Status as of creation: campaign shows "Eligible (Learning)" / "Enabled", 0 impressions (expected — waiting on fund confirmation).

**Gotchas hit and fixed during setup** (useful if building the 2nd campaign or a 3rd later):
- Wizard defaults to Performance Max — must click "view other campaign types" to pick Search.
- "Expert Mode" no longer exists at initial signup (2026); full manual campaign control only becomes available from the main dashboard *after* completing the simplified first-campaign wizard.
- Google auto-suggests generic/low-intent keywords and a bare-domain Final URL from crawling the homepage — both need manual override to the actual product page + real buyer-intent terms.
- After completing payment info, the "You're all set" congrats page does NOT necessarily mean the campaign is submitted — check the dashboard's "Campaigns" list directly (via the sidebar chevron next to "Campaigns" → "All campaigns", or "Continue campaign draft" if still showing) rather than trusting that page alone.

**How to apply**: Next planned step is a **second Search campaign, "Edukasi" tier** — lower-intent/cheaper keywords targeting the 3 blog articles + the free `/kalkulator-hpp` tool, budget ~Rp30.000/day (completing the original Rp100rb/day total split). This one can be built directly from the dashboard's "Create" flow (no forced onboarding wizard, since the account already exists) — likely simpler/faster than campaign #1. Do this once Melan is ready; no need to wait for campaign #1's funds to confirm first.
