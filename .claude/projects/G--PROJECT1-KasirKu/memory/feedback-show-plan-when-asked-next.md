---
name: feedback-show-plan-when-asked-next
description: "When Melan asks what's next / lanjut apa, surface the saved status ledger and roadmap instead of starting fresh"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 497c650d-a553-4313-ba50-9af85cb62fec
---

When Melan opens a session asking something like "lanjut kerjaan apa" / "apa selanjutnya" / "kita lanjut yang kemarin", first point back to the status ledger Artifact and [[product-roadmap-2026-07]] rather than re-deriving priorities from scratch or asking generic clarifying questions.

**Why:** on 2026-07-12, after a full day building growth features (GA, blog, affiliate page, HPP calculator), Melan asked for a status recap to use as "bahan kerjaan besok" (material for tomorrow). A ledger-style status Artifact was published (title `kasirku-status-ledger`, favicon 📒) covering: what shipped today, engine status, pending business decisions, an uncommitted-work callout, a numbered "Prioritas Besok" list, and the roadmap section. Melan explicitly said to save it and pick up from there the next day.

**How to apply:** at the start of a new session, if asked what's next:
1. Check whether that Artifact still exists (list via the Artifact tool if the URL isn't in context) and treat its "Prioritas Besok" list as the starting point — but verify against current git/code state first, since the ledger is a frozen snapshot, not a live source of truth (a memory or artifact can go stale — e.g. Midtrans may have finished verification, pricing may have been decided since).
2. Cross-check open items against [[product-roadmap-2026-07]] for longer-term backlog vs the ledger's next-day punch list.
3. Don't silently start a new unrelated feature — confirm which item from the existing plan to tackle first, since the user framed this as a continuation, not a blank slate.
