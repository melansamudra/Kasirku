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

  // Mirror account: pakai regular client (RLS "mirror user reads own row")
  // Business: tetap service client karena mirror user tidak punya akses RLS ke businesses
  const [{ data: mirrorAccount }, { data: business }] = await Promise.all([
    supabase
      .from("mirror_accounts")
      .select("id, status, permissions")
      .eq("business_id", businessId)
      .maybeSingle(),
    supabase
      .from("businesses")
      .select("id, name, business_type, owner_id")
      .eq("id", businessId)
      .maybeSingle(),
  ]);

  if (!business) notFound();
  const isOwner = business.owner_id === user.id;
  if (!mirrorAccount && !isOwner) notFound();

  if (mirrorAccount?.status === "pending") {
    await service
      .from("mirror_accounts")
      .update({ status: "active" })
      .eq("id", mirrorAccount.id);
  }

  if (!isOwner && mirrorAccount?.status === "revoked") notFound();

  const p = isOwner
    ? null
    : (mirrorAccount!.permissions ?? {}) as Partial<MirrorPerms & {
        show_amount: boolean;
        show_cashier: boolean;
        show_customer: boolean;
      }>;

  const perms: MirrorPerms = isOwner
    ? { show_transactions: true, show_items: true, show_payment_method: true }
    : {
        show_transactions: p!.show_transactions ?? false,
        show_items: p!.show_items ?? false,
        show_payment_method: p!.show_payment_method ?? false,
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
      today={today}
    >
      {children}
    </MirrorViewShell>
  );
}
