# Printable shift settlement + menu sales report (by date)

## Context
User wants two new printable reports, closer to what Moka POS gives at shift close: a **settlement** report (Tunai/QRIS/EDC totals) and a **menu sales** report (item/qty sold) — both printable for any transaction date range, not just tied to a live shift. `close_shift`'s RPC only computes a cash-vs-non-cash split (`shift_rpc.sql:53-133`), and there's no per-method breakdown or print action anywhere in the codebase today (the shift-receipt route from an earlier now-reverted session doesn't exist). The Reports page (`reports/page.tsx`) already computes both aggregations in-memory for its date-filtered view (`byMethod` map, `menuSales` map) and already has CSV/Excel export buttons — that's the natural place to add "print" as a third export option, plus a convenience shortcut right after closing a shift.

Confirmed with user: "Kartu" is renamed to "EDC" (same slot, no schema change — old transactions keep showing "Kartu" as their recorded method, new ones record "EDC"); both reports auto-print to whichever printer(s) are flagged `prints_receipt` in Settings (same target as customer receipts), no printer picker needed.

## Approach

**1. Rename payment method label** — `BUILTIN_PAYMENT_METHODS` in `pos-screen.tsx:91` and its duplicate in `ticket-pos-screen.tsx`: `"Kartu"` → `"EDC"`.

**2. `src/lib/escpos.ts`** — two new ESC/POS ticket builders, following `buildReceiptTicket`'s existing shape/helpers (`padLine`, `RECEIPT_WIDTH`):
   - `buildSettlementTicket({businessName, periodLabel, byMethod: {method, amount}[], totalSales, txCount, voidCount})` — "LAPORAN SETTLEMENT" header, one line per payment method + total, tx/void counts.
   - `buildMenuSalesTicket({businessName, periodLabel, items: {name, qty, amount}[], totalQty, totalAmount})` — "LAPORAN PENJUALAN MENU" header, one line per item, sorted by amount desc (matches Reports page's existing "Menu Terlaris" ordering).

**3. New `src/app/business/[businessId]/report-print-actions.ts`** (business-level, not inside `(dashboard)` or `pos/`, so both can import it) — two server actions:
   - `buildSettlementPrintJobs(businessId, fromIso, toIsoExclusive)`
   - `buildMenuSalesPrintJobs(businessId, fromIso, toIsoExclusive)`
   
   Each: finds `kitchen_printers` where `prints_receipt = true` (same query shape as `buildReceiptPrintJobsForTransaction` in `pos/actions.ts`), queries `transaction_payments`/`transaction_items` joined to `transactions` filtered by business+date range+`voided = false` (same filter pattern already used in `reports/page.tsx:92-101`), aggregates in JS (mirror the page's existing `byMethod`/`menuSales` reduce logic so the printed numbers always match what's on screen), builds one ticket via the new builders, and returns one `KitchenPrintJobPayload` per matching printer. Empty printer list → `{success:true, jobs:[]}`, handled as a "no printer configured" message client-side (same pattern as the existing reprint button's empty state).

**4. New `src/app/business/[businessId]/report-print-buttons.tsx`** (client component, shared) — takes `businessId`, `fromIso`, `toIsoExclusive` as props, renders two buttons ("🖨️ Cetak Settlement", "🖨️ Cetak Laporan Menu"), each calling its action then `dispatchPrintJobs` from `@/lib/dispatch-print-jobs`, inline ✅/❌ state per button — same established pattern as `reprint-kitchen-button.tsx`.

**5. Wire into `reports/page.tsx`** — add `<ReportPrintButtons businessId={businessId} fromIso={fromIso} toIsoExclusive={toIsoExclusive} />` in a new small card right above/alongside the existing "⬇️ Ekspor Data" card, reusing the `fromIso`/`toIsoExclusive` already computed there via `getPeriodRange` — this alone satisfies "bisa cetak berdasarkan tanggal transaksi" for both reports, using the same date-range UI (Hari Ini/7 Hari/Bulan Ini/Semua/Kustom) already on that page.

**6. Wire a shortcut into `pos-screen.tsx`'s shift-close success screen** (`closedSummary` block) — same `<ReportPrintButtons>`, scoped to "today" via `getPeriodRange("today")` imported from `reports/period.ts` (same WIB-correct day-boundary helper the Reports page already uses, avoids reinventing date math). This is a convenience shortcut, not shift-exact scoping (if a business runs multiple shifts same day, this prints the whole day, not just that shift — acceptable given the user's own framing centers on "berdasarkan tanggal transaksi", and the Reports page remains available for any other exact range).

## Verification
- `npx tsc --noEmit`, `npx vitest run`.
- Browser (dev test account): confirm "EDC" now shows at checkout instead of "Kartu". Configure a `prints_receipt` printer (mirroring earlier verified LAN/Bluetooth test flow), do a transaction, then hit both new print buttons on the Reports page — confirm a job gets built for the configured printer (will fail/queue in this environment since there's no real printer, same limitation as all prior printer testing this session — that's fine, proves the build+dispatch path).
- Confirm the numbers in the printed ticket's underlying aggregation match what's already shown on-screen for the same period (spot-check the byMethod/menuSales sums).
- Confirm the shift-close screen's shortcut buttons appear after closing a shift and target today's date range correctly.
