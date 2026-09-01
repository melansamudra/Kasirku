import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionAccess } from "@/lib/billing/status";
import { isFinancePlan, isStarterPlan } from "@/lib/billing/plans";
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
    supabase
      .from("businesses")
      .select(
        "id, name, business_type, owner_id, mirroring_enabled, cost_control_enabled, sell_products_enabled, hidden_nav_keys, stock_locations_enabled",
      )
      .eq("id", businessId)
      .single(),
    supabase.auth.getUser(),
    getSubscriptionAccess(supabase, businessId),
  ]);

  if (!business) {
    notFound();
  }

  if (!userData.user) redirect("/login");

  const isOwner = business.owner_id === userData.user.id;
  let permissions: string[] = [];

  if (!isOwner) {
    const { data: staff } = await supabase
      .from("business_staff")
      .select("permissions, active")
      .eq("business_id", businessId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!staff || !staff.active) {
      notFound();
    }
    permissions = staff.permissions;
  }

  if (access.locked) {
    redirect(`/business/${businessId}/billing`);
  }

  // Grup sidebar per lokasi stok (Gudang Utama/Kitchen Atas/dst) cuma relevan
  // buat bisnis cost-control ATAU bisnis stock_locations_enabled (fitur stok
  // lite, mis. Adi's Culinary) -- query dilewati sama sekali untuk bisnis
  // lain supaya tidak nambah beban.
  const { data: stockLocationRows } = business.cost_control_enabled || business.stock_locations_enabled
    ? await supabase
        .from("stock_locations")
        .select("id, name, is_production, is_default_purchase")
        .eq("business_id", businessId)
        .order("sort_order", { ascending: true })
    : { data: [] };
  const stockLocations = (stockLocationRows ?? []).map((loc) => ({
    id: loc.id,
    name: loc.name,
    isProduction: loc.is_production,
    isDefaultPurchase: loc.is_default_purchase,
  }));

  return (
    <DashboardShell
      businessId={businessId}
      businessName={business.name}
      businessType={business.business_type as "fnb" | "retail" | "tiket"}
      userEmail={userData.user?.email ?? ""}
      billingPastDuePeriodEnd={access.status === "past_due" ? access.periodEnd : null}
      trialPeriodEnd={access.status === "trialing" ? access.periodEnd : null}
      isFinanceOnly={isFinancePlan(access.planCode)}
      isStarter={isStarterPlan(access.planCode)}
      isOwner={isOwner}
      permissions={permissions}
      mirroringEnabled={business.mirroring_enabled ?? false}
      costControlEnabled={business.cost_control_enabled ?? false}
      stockLocationsEnabled={business.stock_locations_enabled ?? false}
      sellProductsEnabled={business.sell_products_enabled ?? false}
      hiddenNavKeys={business.hidden_nav_keys ?? []}
      stockLocations={stockLocations ?? []}
    >
      {children}
    </DashboardShell>
  );
}
