import { createClient } from "@/lib/supabase/server";
import OnboardingForm from "./onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
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
