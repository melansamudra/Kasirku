import { redirect } from "next/navigation";
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
  const access = await getSubscriptionAccess(supabase, businessId);

  if (access.locked) {
    redirect(`/business/${businessId}/billing`);
  }

  return children;
}
