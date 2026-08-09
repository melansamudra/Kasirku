---
name: site-food-photography
description: "Real food/drink photos sourced from Melan's own Google Drive and integrated into homepage hero + blog covers (2026-07-19)"
metadata: 
  node_type: memory
  type: project
  originSessionId: f00c880e-89f5-4451-9a5a-e61d5482df30
---

**2026-07-19**: Melan asked to add food/drink photos to make the site more attractive, and had his own professional photography (shot on a Fujifilm X-T30, edited in Adobe Lightroom) in a shared Google Drive folder ("Foto Menu") rather than wanting stock photos. Shared just the folder link (`drive.google.com/drive/folders/1P_WdjOegv4Zz02Ajk3T6fVeCUKxbbT6n`) and asked me to pick what fit — no per-photo curation from him.

**Technique for pulling files out of a shared Drive folder without an API key** (worth reusing if this comes up again, e.g. more photos later): the Drive web viewer renders thumbnails on canvas, not `<img src>`, so you can't scrape image URLs from the folder listing page directly. But each row has a `data-id` attribute with the file's Drive ID, and `https://drive.google.com/uc?export=download&id=<ID>` fetched via plain `curl` returns the actual original file bytes directly (no auth needed for "anyone with the link" shares) — confirmed working for all 41 files in the folder, no HTML virus-scan interstitial hit even on large ones. Extract every `data-id` via `document.querySelectorAll('[role="row"]')` in a `javascript_exec` call, then batch-curl them.

**Reviewing many photos efficiently**: the Browser pane's `screenshot`/`zoom` actions were broken all session (persistent timeouts, unrelated to any of this session's code changes — same failure hit earlier when trying to verify the new logo). Downloaded the real files to disk instead and used PIL to build 4×3 contact-sheet grids (12 labelled thumbnails per sheet) so the Read tool's image support could review all 41 photos in just 4 tool calls instead of 41. This contact-sheet-grid trick is generally useful any time there's a batch of images to visually triage and the direct screenshot path isn't available or would be too many individual reads.

**What got selected and where** (commit `1711342`):
- `public/images/hero-ayam-goreng.jpg` — crispy fried chicken + rice, Indonesian styling (banana leaf, sambal, rice basket) — main hero photo on the portal homepage (`/`), 2-column hero redesign (text left, photo collage right).
- `public/images/hero-minuman.jpg` — the one drink photo in the whole folder (3 iced blended drinks: choco/taro/strawberry) — small overlapping accent card on the same hero.
- `public/images/blog-hpp.jpg`, `blog-laba-rugi.jpg`, `blog-stok.jpg` — one cover photo per existing blog article (see [[mini-erp-scope]] for the articles themselves), picked for loose thematic fit, not literal illustration.
- Originals were 4-7MB each (way too large for web); resized to 700-1200px wide, JPEG quality 82, landed at 50-260KB each via a throwaway PIL script — this is the size/quality bar to match if more photos from this folder get added later.
- `Article` type in `src/lib/blog/articles.ts` gained an optional `coverImage` field; blog index cards and article detail pages both render it via `next/image` (first use of `next/image` anywhere in this codebase).

**Remaining unused inventory**: 36 more photos are sitting reviewed-but-unused in the contact sheets (burgers, ramen, pizza, dimsum, tahu isi, ayam bakar, nasi goreng with katsu/shrimp, fried enoki mushroom, kroket) — genuinely good quality, just not yet placed anywhere. One photo (a fried-chicken-bucket meal, "photo_28" in the working set) was deliberately skipped because its packaging prop had visible third-party branding text ("CHICKEN BURGER"), not appropriate for a generic CreateImpact/KasirKu context. If asked for more photos later (a gallery, a "menu preview" section, more blog covers), don't re-download the whole folder from scratch — the full-res originals and thumbnails are gone from scratchpad by now (session-temp), but the same Drive folder + `uc?export=download` technique above still applies.

**How to apply**: if Melan sends another Drive folder link for photos, use the `data-id` + `uc?export=download` + contact-sheet approach directly rather than trying screenshot/zoom first (they were unreliable this session and may still be next time).
