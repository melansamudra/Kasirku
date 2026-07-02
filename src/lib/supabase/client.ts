import { createBrowserClient } from "@supabase/ssr";

// Not parameterized with <Database> yet — src/lib/types/database.ts is still
// a placeholder. Wire it back in once it's regenerated from the real schema
// (see the comment in that file).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
