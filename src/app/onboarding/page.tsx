import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingForm from "./onboarding-form";
import LogoutButton from "@/app/dashboard/logout-button";

export default async function OnboardingPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  // Jika user punya akses mirror → jangan tampilkan onboarding, langsung ke laporan
  let debugInfo: string | null = null;
  if (user) {
    const { data: mirrorRows, error: mirrorError } = await supabase
      .from("mirror_accounts")
      .select("business_id, status")
      .in("status", ["active", "pending"])
      .limit(5);

    debugInfo = `uid=${user.id} | rows=${JSON.stringify(mirrorRows)} | err=${mirrorError?.message ?? "none"} | anonKey=${(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").substring(0, 20)}`;

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
      {debugInfo && (
        <pre className="mx-4 rounded bg-zinc-800 p-3 text-[10px] text-green-400 break-all whitespace-pre-wrap">
          {debugInfo}
        </pre>
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
