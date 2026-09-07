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

  // Staf dengan permission "reports" dapat akses PENUH ke laporan (semua
  // sub-halaman & periode), sama seperti owner -- bukan cuma staf tanpa
  // permission apapun yang dulu diam-diam dianggap "bukan owner = dibatasi".
  let canAccessReports = isOwner;
  if (!isOwner && userData.user) {
    const { data: staff } = await supabase
      .from("business_staff")
      .select("permissions, active")
      .eq("business_id", businessId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    canAccessReports = Boolean(staff?.active && (staff.permissions as string[]).includes("reports"));
  }

  return (
    <div>
      {canAccessReports && <ReportsSubnav businessId={businessId} />}
      {children}
    </div>
  );
}
