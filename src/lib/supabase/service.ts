import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS entirely. Only ever import this where
// there is genuinely no authenticated user session to scope queries to: the
// Midtrans webhook, the subscription cron sweep, and guest-checkout Server
// Actions (e.g. the kalkulator HPP desktop app purchase flow — a buyer with
// no KasirKu account at all) writing to a table with zero RLS policies by
// design. Never import this from a Server Component, server action, or
// anywhere else a request is on behalf of a specific signed-in user — use
// src/lib/supabase/server.ts there instead so RLS stays in force.
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
