---
name: discount-settings-redesign
description: Planned PR to remove manual per-transaction discount from POS and replace with configurable discount rules in Settings
metadata: 
  node_type: memory
  type: project
  originSessionId: 813a231d-ee20-4309-a3d8-302f9ddd53fe
  modified: 2026-08-02T02:30:02.752Z
---

Selesai diimplementasi 2026-08-02 (commit fd50f83), sudah di-push dan migration diapply ke Supabase Dev:

1. Remove manual discount entry from the cashier transaction screen entirely — kasir can no longer type in an ad-hoc discount during checkout.
2. Add discount configuration in Settings, with two kinds:
   - Per-product/menu discount (price or percent attached to a specific menu item, applies automatically when that item is sold)
   - Global/promo discount (percent or fixed-amount rule applying to whole transactions, can be toggled active/inactive, has a validity period)

**Why:** user wants discounts to be pre-defined/governed rather than freely entered by cashiers at time of sale — reduces discretion/errors at the register.

**How to apply:** when this PR is picked up, design a discount-rules table (per-item and global/promo types, with active flag + date range), update checkout calculation logic to apply matching rules automatically, remove/hide the old manual discount input in `pos-screen.tsx`/`ticket-pos-screen.tsx`, and add a new Settings page for managing rules.
