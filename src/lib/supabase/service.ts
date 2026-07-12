import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS entirely. Only ever import this from
// the Midtrans webhook and the subscription cron sweep, both of which have
// no authenticated user session to scope queries to. Never import this from
// a Server Component, server action, or anywhere else a request is on
// behalf of a specific signed-in user — use src/lib/supabase/server.ts there
// instead so RLS stays in force.
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
