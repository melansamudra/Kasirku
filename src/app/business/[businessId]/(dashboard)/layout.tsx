import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardShell from "./dashboard-shell";

export default async function BusinessDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const [{ data: business }, { data: userData }] = await Promise.all([
    supabase.from("businesses").select("id, name, business_type").eq("id", businessId).single(),
    supabase.auth.getUser(),
  ]);

  if (!business) {
    notFound();
  }

  return (
    <DashboardShell
      businessId={businessId}
      businessName={business.name}
      businessType={business.business_type as "fnb" | "retail" | "tiket"}
      userEmail={userData.user?.email ?? ""}
    >
      {children}
    </DashboardShell>
  );
}
