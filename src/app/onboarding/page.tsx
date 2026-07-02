import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingForm from "./onboarding-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: businesses } = await supabase.from("businesses").select("id").limit(1);

  if (businesses && businesses.length > 0) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
      <OnboardingForm />
    </div>
  );
}
