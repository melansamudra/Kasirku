import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionAccess } from "@/lib/billing/status";

export default async function PosLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const [{ data: business }, { data: userData }, access] = await Promise.all([
    supabase.from("businesses").select("owner_id").eq("id", businessId).single(),
    supabase.auth.getUser(),
    getSubscriptionAccess(supabase, businessId),
  ]);

  if (!business) notFound();

  const isOwner = business.owner_id === userData.user?.id;

  if (!isOwner) {
    const { data: staff } = await supabase
      .from("business_staff")
      .select("permissions, active")
      .eq("business_id", businessId)
      .eq("user_id", userData.user!.id)
      .maybeSingle();

    if (!staff || !staff.active || !staff.permissions.includes("pos")) {
      notFound();
    }
  }

  if (access.locked) {
    redirect(`/business/${businessId}/billing`);
  }

  return children;
}
