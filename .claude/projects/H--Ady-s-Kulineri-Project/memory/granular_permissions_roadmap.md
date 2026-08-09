---
name: granular-permissions-roadmap
description: "User wants a future granular/checklist-based permission system for backoffice admin roles, deferred for now"
metadata: 
  node_type: memory
  type: project
  originSessionId: 91ed84cf-3df0-4514-9706-2b63ddaa62ba
  modified: 2026-07-24T14:36:10.987Z
---

User (Mat Khamdan) wants to eventually expand beyond the current 2-role RBAC (`SUPER_ADMIN`, `CASHIER`) to support a granular, checklist-style permission system for backoffice staff — e.g. an "Admin" user whose access to each menu/feature (branches, menu, users, printers, reports) is individually toggled on/off, rather than a fixed role tier.

**Why:** Stated reason: "kedepan backoffice kita perlengkap" — as the backoffice grows, they want finer-grained control over what different admin-tier staff can access than a single flat `SUPER_ADMIN` role allows.

**How to apply:** This was explicitly deferred — when this conversation happened, we agreed to finish core setup (branches/menu/cashier accounts) with the existing 2-role system first, and treat granular permissions as a separate future feature once the exact menu/action list to gate is defined. Do not build a permissions table or rework RLS policies for this unprompted — wait until the user asks to scope it, then clarify: the specific set of toggleable actions/menus, whether it replaces or extends `SUPER_ADMIN`, and how it interacts with the JWT claims hook (`custom_access_token_hook` in `supabase/migrations/0002_rls_policies.sql`) and every RLS policy currently keyed on `is_super_admin()`.
