import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import MirrorViewShell from "./mirror-view-shell";
import type { MirrorPerms } from "./mirror-sidebar";

export default async function MirrorViewLayout({
  params,
  children,
}: {
  params: Promise<{ businessId: string }>;
  children: React.ReactNode;
}) {
  const { businessId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const service = createServiceClient();

  const [{ data: mirrorAccount }, { data: business }] = await Promise.all([
    service
      .from("mirror_accounts")
      .select("id, status, permissions")
      .eq("business_id", businessId)
      .eq("user_id", user.id)
      .maybeSingle(),
    service
      .from("businesses")
      .select("id, name, business_type")
      .eq("id", businessId)
      .single(),
  ]);

  if (!mirrorAccount || !business) notFound();

  if (mirrorAccount.status === "pending") {
    await service
      .from("mirror_accounts")
      .update({ status: "active" })
      .eq("id", mirrorAccount.id);
  }

  if (mirrorAccount.status === "revoked") notFound();

  const p = (mirrorAccount.permissions ?? {}) as Partial<MirrorPerms & {
    show_amount: boolean;
    show_cashier: boolean;
    show_customer: boolean;
  }>;

  const perms: MirrorPerms = {
    show_transactions: p.show_transactions ?? false,
    show_purchases: p.show_purchases ?? false,
    show_kas_harian: p.show_kas_harian ?? false,
    show_items: p.show_items ?? false,
  };

  const today = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <MirrorViewShell
      businessId={businessId}
      businessName={business.name}
      businessType={business.business_type}
      perms={perms}
      userEmail={user.email ?? ""}
      today={today}
    >
      {children}
    </MirrorViewShell>
  );
}
