import type { createClient } from "@/lib/supabase/server";

export type CurrentActor = {
  userId: string;
  name: string;
  isOwner: boolean;
  permissions: string[];
};

// Identitas akun yang sedang login untuk sebuah bisnis -- dipakai buat
// approval/otorisasi yang harus terikat sesi login sungguhan (bukan dropdown
// nama bebas dari tabel `employees`, yang tidak punya akun/login sama
// sekali). Kembalikan null kalau tidak login atau bukan owner/staff aktif
// bisnis ini.
export async function getCurrentActor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
): Promise<CurrentActor | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: business } = await supabase
    .from("businesses")
    .select("owner_id")
    .eq("id", businessId)
    .maybeSingle();
  if (!business) return null;

  if (business.owner_id === user.id) {
    return { userId: user.id, name: user.email ?? "Owner", isOwner: true, permissions: [] };
  }

  const { data: staff } = await supabase
    .from("business_staff")
    .select("name, permissions, active")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!staff || !staff.active) return null;

  return { userId: user.id, name: staff.name, isOwner: false, permissions: staff.permissions };
}

export function canApprovePo(actor: CurrentActor): boolean {
  return actor.isOwner || actor.permissions.includes("purchase-orders-approve");
}
