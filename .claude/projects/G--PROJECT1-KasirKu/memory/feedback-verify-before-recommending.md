---
name: feedback-verify-before-recommending
description: "Verify current state exists/doesn't exist before recommending setup steps — don't take a casual user statement as ground truth"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ca864c9f-7c89-4e64-9c64-0e933fd48665
---

Before recommending a setup/deploy/creation task ("let's deploy this", "let's set up X"), actively verify whether it already exists rather than trusting a casual statement at face value.

**Why:** on 2026-07-14 ([[deployment-status]]) the user said the site "belum diakses publik" (not yet publicly accessible). That was taken as ground truth, leading to a full manual Vercel deploy walkthrough (create account, import repo, set env vars, deploy) being written out. It turned out the app was **already live** at `kasirku-nine.vercel.app` via an existing GitHub↔Vercel auto-deploy integration — discovered only because a stray public signup ("HAHA") prompted a closer look. The recommended steps were entirely unnecessary and had to be walked back.

**How to apply:** when a task is "make X exist/live/deployed", check first — `git remote -v`, look for `.vercel/project.json`, hit the likely production URL, check the GitHub repo's own deployment status/environments, grep config for existing hooks — before writing instructions assuming a blank slate. The user's own belief about current state (especially about infra/deploy status they didn't personally set up or don't check often) can be wrong; a quick check is cheap compared to giving wrong instructions that need correcting later.
