import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import OnboardingForm from "./onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const service = createServiceClient();

  const { data: { user } } = await supabase.auth.getUser();

  // Jika user punya akses mirror → jangan tampilkan onboarding, langsung ke laporan
  if (user) {
    const { data: mirrorRows } = await service
      .from("mirror_accounts")
      .select("business_id")
      .eq("user_id", user.id)
      .in("status", ["active", "pending"])
      .limit(1);

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
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
      <OnboardingForm
        hasExistingBusinesses={hasExistingBusinesses}
        otherBusinesses={businesses ?? []}
      />
    </div>
  );
}
