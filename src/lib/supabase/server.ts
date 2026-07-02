import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Not parameterized with <Database> yet — src/lib/types/database.ts is still
// a placeholder. Wire it back in once it's regenerated from the real schema
// (see the comment in that file).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component — safe to ignore
            // because middleware refreshes the session on every request.
          }
        },
      },
    },
  );
}
