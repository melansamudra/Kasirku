import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionAccess } from "@/lib/billing/status";
import { isFinancePlan } from "@/lib/billing/plans";
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

  const [{ data: business }, { data: userData }, access] = await Promise.all([
    supabase.from("businesses").select("id, name, business_type").eq("id", businessId).single(),
    supabase.auth.getUser(),
    getSubscriptionAccess(supabase, businessId),
  ]);

  if (!business) {
    notFound();
  }

  if (access.locked) {
    redirect(`/business/${businessId}/billing`);
  }

  return (
    <DashboardShell
      businessId={businessId}
      businessName={business.name}
      businessType={business.business_type as "fnb" | "retail" | "tiket"}
      userEmail={userData.user?.email ?? ""}
      billingPastDuePeriodEnd={access.status === "past_due" ? access.periodEnd : null}
      isFinanceOnly={isFinancePlan(access.planCode)}
    >
      {children}
    </DashboardShell>
  );
}
