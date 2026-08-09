---
name: kasirku-feature-backlog
description: "Ongoing backlog of features Melan wants added to Kasirku (the multi-tenant POS/accounting SaaS at createimpact.id), and what's already shipped"
metadata: 
  node_type: memory
  type: project
  originSessionId: bf9744cd-ca93-4f6f-a6b4-fd23a9ce2ba3
  modified: 2026-07-26T14:38:09.918Z
---

Project: **Kasirku** (repo `melansamudra/Kasirku` on GitHub, cloned locally at `H:\Kasirku`; live at
createimpact.id). Separate codebase from [[granular-permissions-roadmap]] (that memory is about the
OTHER project, "Ady's Kulineri"/apps/web — do not conflate the two).

Supabase has two projects: **KasirKu** (production) and **KasirKu Dev** (staging) — always run new
migrations on Dev first, confirm success, then run the identical SQL on production, then commit +
push to `master` (Vercel auto-deploys `master` straight to production).

**Why this list exists:** Melan compared Kasirku point-by-point against Moka POS and is working
through a backlog of gaps/asks one at a time, confirming scope via questions before each build
since this is live production financial data (real businesses, real accounting).

## Shipped so far (2026-07-24/25/26 session)
- Shift cash-in/cash-out linked to shift reconciliation (`post_shift_cash_movement` RPC, `close_shift` updated).
- Sidebar regrouped into Utama / Fitur Lanjutan / Lainnya (mirrors Moka's flatter nav, buries full double-entry accounting).
- Automatic 3-day trial on new business signup (`start_trial` RPC, `trialing` subscription status).
- Manual transaction entry from backoffice, no cashier/shift needed, backdated date allowed (`create_manual_transaction` RPC, `MAN-` invoice prefix, `/transactions/new`).
- Owner can void a transaction directly, no manager PIN required (`owner_void_transaction` RPC; old PIN-based `void_transaction` left untouched/unused elsewhere).
- Menu/ingredient copy when creating a new branch already existed pre-session (`copyMenuFromBusiness` in onboarding — confirmed working, no changes needed).
- Admin sub-accounts with per-feature permission checklist (`business_staff` table, `is_business_owner()`/`owns_business()` RLS, `/business/[id]/admins`, checklist keys in `src/lib/permissions.ts`). Enforcement is app-layer only (DashboardShell), DB access is all-or-nothing via `owns_business()`. Settings/Kelola Admin stay owner-only forever (businesses table RLS deliberately not opened to staff writes).
- Transaction import/export on `/transactions` — clean dedicated CSV export (separate from the older jargon-heavy `reports/export`), and CSV import that groups rows by a required "Referensi" column into multi-item transactions via the existing `create_manual_transaction` RPC (no new RPC). Product/customer must already exist, matched by name.
- Ingredient import/export on `/ingredients` — export CSV doubles as the import template (same convention as products). Import matches by name (no SKU/barcode for ingredients), replicates `editIngredient`'s side effects on cost change (price history + recipe cost recalculation). Needed a small migration adding `'impor'` to `ingredient_price_history`'s source check constraint — the insert was silently failing before that (uncaught error) since the constraint only allowed `'awal'/'pembelian'/'manual'`.
- **Kitchen/bar LAN printing fixed at the architecture level.** While scoping "printer settings page" (backlog #1 below), discovered kitchen ticket printing had *never actually worked* in production — the dispatch ran inside a Vercel Server Action (`checkout()`/`updateSelfOrderStatus()` in `pos/actions.ts`), and Vercel serverless functions cannot reach a shop's private LAN IPs (`192.168.x.x`). Confirmed with Melan: no client had ever gotten LAN printing to work. Fixed by splitting "build ticket bytes" (still server-side, `buildKitchenPrintJobs` in `src/lib/kitchen-print.ts`, renamed from `dispatchKitchenPrint`) from "send bytes to the printer" (moved to the browser, since the cashier's PC is physically on the shop's LAN). New standalone app `print-agent/` (not part of the Next.js build — plain Node/tsx, cloned from the same pattern already proven in the sibling "Ady's Kulineri" project's `apps/print-agent`) runs locally on the cashier's PC at `127.0.0.1:9123`, receives `{ip, port, bytes}` over HTTP from the browser (`src/lib/print-agent-client.ts` → `src/lib/dispatch-print-jobs.ts`), and opens the raw TCP socket itself. Printer/agent failures still never block a sale (fire-and-forget dispatch after checkout succeeds). Shipped commit `634edc6`, deployed 2026-07-26.
  **Operational requirement — not automatic from deploying:** LAN kitchen printing only works once a cashier's PC has the print-agent installed and running. This needs to be communicated to Melan/clients as a one-time setup step per till, not something that "just works" post-deploy.
- **Print-agent packaged as a double-click installer** (no Node.js/npm/terminal needed by cashiers). `print-agent/scripts/build-exe.cjs` bundles with esbuild and uses Node's built-in Single Executable Application (SEA) feature to produce a standalone `dist/kasirku-print-agent.exe` (~90MB) — must be built *on Windows* since SEA reuses whatever Node binary builds it. (`pkg`/`@yao-pkg/pkg` was tried first and doesn't work in this environment: no prebuilt Node binary available for download, and no native build toolchain to compile Node from source as a fallback.) `print-agent/install.ps1` (right-click → Run with PowerShell) copies the exe to `%LOCALAPPDATA%\KasirkuPrintAgent`, adds a Startup-folder shortcut so it auto-launches on login, and starts it immediately; `uninstall.ps1` reverses it. Both tested end-to-end locally (install → process running + shortcut exists → uninstall → both gone). `config.ts`'s default allowed-origins now includes `https://createimpact.id` directly, so the packaged exe needs zero env-var configuration. Shipped commit `d7155cb`, deployed 2026-07-26. Sent the built exe + both scripts to Melan directly as a zip (not committed to git — `print-agent/dist` is gitignored; rebuild anytime with `npm run build:exe` in `print-agent/`).
- **Android app for tablet-only cashiers** (`android-app/`, new sibling project like `print-agent/`) — for shops where the cashier has ONLY a tablet, no PC at all, so `print-agent` can't run. Wraps the live site (`server.url: https://createimpact.id` in `capacitor.config.ts` — NOT a bundled/static copy, Kasirku is Server-Actions-heavy) via Capacitor, plus one native Kotlin plugin `KitchenPrinterPlugin` (`android-app/android/app/src/main/java/id/createimpact/kasirku/KitchenPrinterPlugin.kt`) exposing what a browser can't do: `printLan` (raw TCP socket, mirrors `print-agent/src/printSocket.ts`) and `printBluetooth`/`listPairedBluetoothDevices`/`isBluetoothEnabled` (Bluetooth Classic SPP — this is also what finally implements real Bluetooth kitchen printing, previously dead code, see old backlog #2 below). Bluetooth device picker only ever reads already-*paired* devices (`bluetoothAdapter.bondedDevices`), never calls `startDiscovery()` — deliberate, so the app needs zero location permission. Web side: `src/lib/kitchen-printer-plugin.ts` + `src/lib/dispatch-print-jobs.ts` (now branches per print job on both platform *and* `connectionType`: native+LAN → plugin, native+BT → plugin, browser+LAN → print-agent unchanged, browser+BT → immediate `unsupported_on_web`). `kitchen_printers` gained a nullable `device_label` column (migration `20260726130000_kitchen_printers_device_label.sql`) so the Settings printer list shows a friendly name instead of a raw MAC once picked via the native picker; `add-printer-form.tsx` falls back to the old free-text field on any plain browser (including PCs opening the same Settings page) — no regression there. Distributed as a **self-signed APK, sideloaded** (no Play Store, no Google Play Developer account) — `android-app/android/kasirku-release.keystore` + `keystore.properties` (both gitignored, **back them up**, losing them means every installed tablet needs full uninstall+reinstall to get future updates, Android requires matching signing key for in-place updates). Shipped commit `99fc09d` (+ immediate fix `25fc6d3`, see gotcha below), deployed 2026-07-26. Sent `Kasirku.apk` directly to Melan.
  **Verified live in an Android emulator this session:** WebView loads the real production site incl. client-side nav to `/login`; `printLan` round-tripped exact bytes to a real TCP listener (success *and* connection-refused paths); all three Bluetooth methods respond correctly (permission request/grant flow, adapter-disabled handling) — but actual Bluetooth Classic SPP against a **real printer** could not be tested (no physical hardware here) — flagged as a must-do before rollout to any shop that fully depends on it, ideally against 2-3 printer brands.
  **Operational requirement**, same shape as print-agent: shop owner must sideload `Kasirku.apk` onto the tablet themselves (one-time, allow "install from unknown sources") — not automatic from deploying. No update channel yet — new APKs must be manually redistributed.
- **Batch of 5 fixes/features from real first-use feedback on the Android app** (2026-07-26, after Melan actually installed and used it — this is the pattern going forward: ship, let him use it for real, fix what real use surfaces, not just what's theoretically asked for):
  1. **Security fix — staff could void with no PIN** (`ba34b0a`): `owns_business()` treats owner and any active `business_staff` the same, but `owner_void_transaction` only checked that — so staff with "transactions" permission could void exactly like the owner. Now `void-transaction-form.tsx` checks real `isOwner` (computed fresh in the transaction detail page, business.owner_id === auth user id) and branches: owner keeps no-PIN, everyone else must enter a PIN checked against an active manager-role `cashiers` row via the RPC `void_transaction` (already existed, already deployed, just never wired into any UI — same pattern `void_ticket_transaction` already used for tickets). No migration needed.
  2. **Manual transaction: added a time field + moved CSV import into its own dialog** (`03d52ad`): date-only input meant every manual transaction saved at a hardcoded 12:00:00 even though `create_manual_transaction`'s RPC already accepted a full timestamptz — added a real time input alongside date. "Impor dari CSV" was a big inline card always sitting above the transaction list; moved into a dialog opened by a new "📥 Impor CSV" button (same bottom-sheet/dialog pattern as POS Menu etc.) so the list itself is the default view.
  3. **Removed stock-based selling restrictions entirely** (`723c91c`): `addToCart`/`changeQty`/product-grid/variant-picker all used to block adding or capping quantity based on `product.stock` (including hard-blocking at 0). Confirmed `checkout_transaction` RPC never enforced this server-side either (`stock = greatest(0, stock - qty)`, no rejection) — purely an overly strict client-side rule, no migration needed. Deliberately NOT a toggle — Melan chose full removal over a per-business setting.
  4. **Structured product categories** (`4ab3250`, migration `20260726140000_product_categories.sql`): new `product_categories` table (business-scoped, unique name), managed by a small widget **embedded at the top of Kelola Produk** (deliberately NOT a separate nav page/section — Melan explicitly scoped this down from a fuller "Kelola Kategori" page after initially approving that bigger option). Add/Edit Product's category field is now a required `<select>` instead of free text — prevents typos/near-duplicates that silently broke kitchen-printer routing (`kitchen_printers.categories` matches by exact string). `products.category` itself is unchanged (still plain text) — the new table only constrains/populates valid names, nothing downstream needed to change.
  5. **Category filter tabs on the POS product grid** (`a19d442`): "Semua" + one tab per category-in-use, appears above the grid once ≥1 category exists, combines with the existing search box. Built AFTER #4 on purpose (would've needed rework if built against the old free-text categories first).
  **All verified via**: typecheck + lint + 43 Vitest tests + `next build` clean for every item, plus live REST smoke tests against KasirKu Dev for the two DB-touching ones (void RPC call confirmed existing/callable; product_categories insert + duplicate-constraint rejection both confirmed). None of these could be click-tested in a real browser session (still no owner login performed by Claude, per the credential-entry policy) — Melan's own usage is what surfaced #1 and drove the whole batch, so this is a real gap worth having him spot-check when convenient, same as the earlier printer-page caveat.
- **Android app locked to POS-only, no backoffice at all** (real first-install feedback from Melan — the initial version was "just the whole website wrapped," including the full owner sidebar with Kelola Produk/Pelanggan/Kelola Admin/accounting/etc., which he explicitly did NOT want; he showed Moka's own model as the reference — Moka's Employee Access has a "Cashier: App Only" role vs "Administrator: App & Back-office", the app itself never exposes backoffice regardless of role). Fixed with **web-only changes** (no APK rebuild needed for this part, unlike the `/login` start-URL fix which IS baked into the APK):
  - `capacitor.config.ts`: `server.url` → `https://createimpact.id/login` (was the bare marketing homepage) — required an APK rebuild+resend, commit `2b43d45`.
  - `dashboard-shell.tsx`: whenever `Capacitor.isNativePlatform()`, forces `navIsOwner=false` + `navPermissions=["transactions","shifts"]` into the SAME `isItemAllowed`/`filterGroupsForPermissions` mechanism already built for `business_staff` non-owner accounts — regardless of who actually logged in (owner or staff). Sidebar collapses to just Dashboard + Riwayat Transaksi + Riwayat Shift; any other `(dashboard)` route hit directly still renders (shows `AccessDeniedPanel`, doesn't 404/crash). Commit `9d80161`.
  - `pos-screen.tsx`'s POS Menu: hides the "📊 Laporan" link when native (not in the allowed set, would've dead-ended on Akses Ditolak). Same commit.
  - `transactions/page.tsx`: even with the route now reachable, the page itself still showed Ekspor CSV / + Tambah Transaksi Manual / Impor-dari-CSV — backoffice bulk-data tools, not what a cashier needs. Split into `TransactionButtons`/`TransactionImportCard` client components in new `transaction-actions.tsx`, each returns `null` when native — only the read-only transaction list remains. Commit `5bf24d1`.
  **Known gap, not addressed**: `shifts/page.tsx` was checked and is already pure read-only (no action buttons) — fine as-is. **"tiket" (ticket/attraction) business type** has no `transactions`-equivalent nav key in the native allowlist (its Utama group uses `check-in`/`ticket-reports`/`members` instead) — so a tiket-type business on native would only keep Riwayat Shift, losing its Aktivitas-equivalent. Not fixed — the Android app work has been F&B-focused throughout, revisit if a tiket-type customer needs this app.
  **Pattern for next time a route needs "hide backoffice-only actions on native but keep the page reachable"**: don't gate at the server-component page level (`Capacitor.isNativePlatform()` needs `window`, unavailable server-side) — extract the specific actions/buttons into a small `"use client"` component that early-returns `null` when native, keep the rest of the page server-rendered as-is. Already the pattern in `add-printer-form.tsx` (Settings) and now `transaction-actions.tsx`.

## Environment/debugging notes learned this session (useful for next time)
- `H:\Kasirku\.env.local` has real KasirKu Dev credentials (URL, publishable/anon key, service_role
  key) — already set up for local testing, gitignored. Reuse it rather than re-asking the user.
- `preview_start{name:...}` only resolves `.claude/launch.json` from the ORIGINAL session project
  root (`H:\Ady's Kulineri Project`), not from `H:\Kasirku` — it silently launches the wrong app
  instead of erroring. For Kasirku, start the dev server manually via Bash
  (`cd "H:/Kasirku" && PORT=3001 npm run dev`, `run_in_background: true`) and just `navigate`/
  `preview_start{url:"http://localhost:3001"}` to attach the browser — don't rely on `name`.
- Next.js 16 Turbopack **dev server** can fail to discover a brand-new route (silent 404 resolving
  straight to `/_not-found`, even after clearing `.next` and a full restart) while `next build` +
  `next start` serves the exact same route correctly. If a new page 404s in dev but the code looks
  right, verify with `npx next build` (route should appear in the output tree) before assuming a
  code bug — then test against `next start` instead of `next dev`.
- RLS gotcha hit twice while building `business_staff`: (1) two tables whose policies query each
  other under normal (non-security-definer) RLS causes "infinite recursion detected in policy" —
  route at least one side through a `security definer` helper function. (2) an unqualified column
  name in a correlated subquery's USING clause silently resolves to the *subquery's own* table if
  it has a same-named column (e.g. bare `id` inside a subquery on a table that also has `id`),
  instead of the outer table — always qualify the outer reference explicitly
  (`businesses.id`, not bare `id`). Caught both only through actual runtime testing, not `tsc`/lint.
- Supabase free-tier Dev project has a very low outgoing-email rate limit — `inviteUserByEmail` in
  testing hits "email rate limit exceeded" fast. To keep testing without waiting it out, create the
  `auth.users` row directly (`POST /auth/v1/admin/users` with `email_confirm:true` and a password)
  and insert the `business_staff` row via the REST API with the service_role key, bypassing the
  email step entirely — sufficient to test app logic since Supabase's own invite/email mechanics
  aren't the custom code being verified.

- POS/kasir screen (`pos-screen.tsx`, PIN-based cashier session) got a "☰ Menu" panel linking to
  Riwayat Transaksi/Laporan/Riwayat Shift (existing backoffice pages — the POS session already runs
  under the owner's authenticated session, so linking, not rebuilding, was enough). Only the F&B/
  retail POS screen was updated — `ticket-pos-screen.tsx` (tiket business type) was NOT touched.
- **This machine now has Android dev tooling installed** (Phase 0 of the Android app work): JDK 21
  (Temurin, portable ZIP at `%LOCALAPPDATA%\Java\jdk-21.0.11+10` — the MSI installer hung needing UAC
  elevation this session can't grant, portable ZIP has no such issue) + Android SDK cmdline-tools at
  `%LOCALAPPDATA%\Android\sdk` (`ANDROID_HOME`/`JAVA_HOME` set at the User env level, but **each new
  Bash/PowerShell tool call starts a fresh process that doesn't inherit them** — always set both
  inline at the top of every command that needs them, don't rely on persisted `$env:`). An AVD named
  `kasirku_test` (API 34, google_apis x86_64) already exists. Windows Hypervisor Platform had to be
  manually enabled by Melan (`dism.exe /online /enable-feature /featurename:HypervisorPlatform`, as
  Administrator, + reboot) before the emulator could use hardware acceleration at all — without it,
  x86_64 emulation refuses to start outright.
  **Emulator is chronically ANR-prone on this host** (~4GB RAM, tight for AVD + full Android system)
  — expect repeated "System UI isn't responding"/"Pixel Launcher isn't responding" dialogs on nearly
  every cold boot/app relaunch; just tap "Wait" and retry, it settles after a few rounds. The
  emulator's own virtual Bluetooth stack is also flaky (crashes under load) — safe to
  `adb shell svc bluetooth disable` early in a session to stop the crash-loop noise, `svc bluetooth
  enable` only when actually needed for a BT-related test.
  **To call a Capacitor native plugin directly without going through app UI** (bypasses fragile touch
  automation entirely): `adb shell cat /proc/net/unix | grep devtools` to find the WebView's
  `webview_devtools_remote_<pid>` socket, `adb forward tcp:9222 localabstract:<that-socket-name>`,
  then open a raw WebSocket to `ws://localhost:9222/devtools/page/<id>` (get `<id>` from
  `curl localhost:9222/json`) and send a Chrome DevTools Protocol `Runtime.evaluate` command calling
  `window.Capacitor.Plugins.<PluginName>.<method>(...)` — this is how `printLan`/Bluetooth methods
  got verified this session, including against a fake TCP listener on the host (reachable from the
  emulator via `adb reverse tcp:PORT tcp:PORT`, which sidesteps Windows Firewall — more reliable than
  the `10.0.2.2` host alias, which got silently blocked by the firewall here).
  **To skip an Android runtime permission dialog** (e.g. `BLUETOOTH_CONNECT`) without fighting the
  emulator's flaky System UI for the tap: `adb shell pm grant <package> <permission>` grants it
  directly, no dialog needed at all.
  **Test a signed release build, not just debug**: `adb install` refuses to install a release APK
  over a debug-signed install of the same app (`INSTALL_FAILED_UPDATE_INCOMPATIBLE` — different
  signing keys) — `adb uninstall <package>` first, matches exactly what would happen to a real user
  upgrading from a differently-signed build.

## ⚠️ Gotcha that broke a production deploy once — check before adding another sibling project
Root `tsconfig.json`'s `include` is broad (`**/*.ts`, `**/*.tsx`) and its `exclude` explicitly lists
every standalone sibling project now (`android-app`, `print-agent`, `desktop-app`) precisely because
Next.js's build-time type check will otherwise pick up files from them too. This bit hard: adding
`android-app/` broke the production build (`Cannot find module '@capacitor/cli'` from
`android-app/capacitor.config.ts`) because that sibling's `node_modules` doesn't exist on Vercel's
fresh checkout (only exists locally *if* someone happened to `npm install` inside it) — passed every
local `tsc`/`next build` check right up until the real Vercel deploy, since locally the folder
existed. **If a new top-level sibling project (own `package.json`) gets added, add it to
`tsconfig.json`'s `exclude` in the same commit**, and if in doubt, verify by temporarily renaming
that sibling's `node_modules` away and re-running `npx next build` locally before pushing — that's
the only way to actually reproduce what Vercel's fresh clone sees.

- **Cashier-facing printer test page** at `/business/[id]/pos/printers`, linked from the POS
  Menu ("🖨️ Printer Dapur & Bar", opens in a new tab like the other Menu entries so the cart
  survives). View + "Tes Cetak" only, scoped down from a fuller CRUD option Melan was offered —
  add/edit/delete printers deliberately stays in the general Settings page, not duplicated here.
  New server action `buildTestPrintJob(businessId, printerId)` in `pos/actions.ts` builds one
  standalone ticket for a single chosen printer directly via `buildKitchenTicket` (no category
  routing — that's what `buildKitchenPrintJobs` is for real orders, not needed for a one-off test).
  `dispatch-print-jobs.ts`'s `dispatchPrintJobs` now **returns** per-job `{job, result}[]`
  (previously `void`) so this new screen can show inline success/failure — existing fire-and-forget
  callers (`pos-screen.tsx`, `use-offline-sync.ts`) are unaffected, they still just `void` the call.
  Shipped commit `48d3b8e`, deployed 2026-07-26.
  **Not live-clicked-through**: reaching this page needs an authenticated owner session first
  (middleware-gated), and entering a password isn't something Claude does even for testing — so
  verification here was typecheck/lint/43-tests/build-clean plus reusing already-live-verified
  pieces (`dispatchPrintJobs`, `buildKitchenTicket`) and copying the exact auth-gate pattern from
  the already-working `pos/check-in/page.tsx`. Confirmed post-deploy only that the route itself
  responds (307 → login, not a 404) — a real click-through with Melan's own login is still worth
  doing whenever convenient, low urgency given the reused pieces.

## Backlog — not started yet
1. **Bluetooth-to-real-hardware validation for the Android app** — `printBluetooth` is implemented
   and verified against the emulator's virtual adapter (see Shipped: Android app), but genuinely
   needs testing against 2-3 real printer brands before any shop that fully depends on a tablet
   rolls it out — secure-vs-insecure RFCOMM socket compatibility varies by printer chipset in ways
   that can't be checked without hardware in hand. **Blocked on Melan having a printer to test with**
   (as of 2026-07-26 he doesn't yet) — he'll come back to this once he has one, don't chase it.
   Once validated, the natural follow-up is a self-serve APK download page on the site itself
   (discussed but deliberately deferred until Bluetooth is proven — see session notes) instead of
   Melan manually sending `Kasirku.apk` to each shop.
2. **Mobile app recommendation** — evaluate/advise whether Kasirku should get a native iOS app too
   (the Android side is now shipped) vs staying Android+web-only. Discussion/recommendation ask, not
   a build task. This was the LAST item from Melan's original 5-point list — everything else shipped.

**How to apply:** When Melan says "lanjut ke #N" or references one of these by description, pick up
directly — the context above (shipped items, RPC names, migration file naming convention
`YYYYMMDDHHMMSS_description.sql`, Dev-then-production-then-push workflow) should be enough to start
planning without re-deriving it from scratch.
