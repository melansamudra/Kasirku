import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import OnboardingForm from "./onboarding-form";
import LogoutButton from "@/app/dashboard/logout-button";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const service = createServiceClient();

  const { data: { user } } = await supabase.auth.getUser();

  // Jika user punya akses mirror → jangan tampilkan onboarding, langsung ke laporan
  if (user) {
    let mirrorRows = (
      await service
        .from("mirror_accounts")
        .select("id, business_id")
        .eq("user_id", user.id)
        .in("status", ["active", "pending"])
        .limit(1)
    ).data;

    // Fallback: cari by email jika user_id tidak cocok
    if ((!mirrorRows || mirrorRows.length === 0) && user.email) {
      const { data: byEmail } = await service
        .from("mirror_accounts")
        .select("id, business_id")
        .eq("invited_email", user.email.toLowerCase())
        .in("status", ["active", "pending"])
        .limit(1);
      if (byEmail && byEmail.length > 0) {
        await service
          .from("mirror_accounts")
          .update({ user_id: user.id })
          .eq("id", byEmail[0].id);
        mirrorRows = byEmail;
      }
    }

    if (mirrorRows && mirrorRows.length > 0) {
      redirect(`/business/${mirrorRows[0].business_id}/laporan`);
    }
  }

  // RLS scopes ini otomatis ke bisnis milik user sendiri — lihat
  // [[businessId]]/(dashboard)/page.tsx untuk pola query yang sama.
  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name, business_type")
    .order("created_at", { ascending: true });

  const hasExistingBusinesses = Boolean(businesses && businesses.length > 0);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      {user && (
        <div className="flex items-center justify-end gap-3 px-4 py-3">
          <span className="text-xs text-zinc-400">{user.email}</span>
          <LogoutButton variant="inline" />
        </div>
      )}
      <div className="flex flex-1 items-center justify-center px-4">
        <OnboardingForm
          hasExistingBusinesses={hasExistingBusinesses}
          otherBusinesses={businesses ?? []}
        />
      </div>
    </div>
  );
}
