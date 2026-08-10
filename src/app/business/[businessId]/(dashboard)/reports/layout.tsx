import { createClient } from "@/lib/supabase/server";
import ReportsSubnav from "./reports-subnav";

export default async function ReportsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();
  const [{ data: business }, { data: userData }] = await Promise.all([
    supabase.from("businesses").select("owner_id").eq("id", businessId).single(),
    supabase.auth.getUser(),
  ]);
  const isOwner = business?.owner_id === userData.user?.id;

  return (
    <div>
      {isOwner && <ReportsSubnav businessId={businessId} />}
      {children}
    </div>
  );
}
