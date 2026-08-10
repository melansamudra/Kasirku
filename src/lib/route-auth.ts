import { createClient } from "@/lib/supabase/server";

/**
 * Verifikasi bahwa user yang sedang login punya akses ke bisnis ini —
 * sebagai owner atau staff aktif. Dipakai di route handlers yang tidak
 * dilindungi oleh layout (route.ts bypass layout.tsx di Next.js App Router).
 *
 * Kembalikan data bisnis jika akses valid, null jika tidak.
 */
export async function assertBusinessAccess(
  businessId: string,
): Promise<{ id: string; name: string; owner_id: string } | null> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, owner_id")
    .eq("id", businessId)
    .maybeSingle();

  if (!business) return null;
  if (business.owner_id === user.id) return business;

  const { data: staff } = await supabase
    .from("business_staff")
    .select("active")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  return staff ? business : null;
}
