import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionAccess } from "@/lib/billing/status";
import Logo from "@/components/logo";

function AccessDenied({ businessId }: { businessId: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600">
        <Logo className="h-8 w-8 brightness-0 invert" />
      </div>
      <div>
        <h1 className="text-lg font-bold text-zinc-900">Akses Ditolak</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Kamu tidak memiliki izin untuk mengakses halaman Kasir.
          <br />
          Hubungi pemilik toko untuk mendapatkan akses.
        </p>
      </div>
      <Link
        href={`/business/${businessId}`}
        className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Ke Dashboard
      </Link>
    </div>
  );
}

export default async function PosLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const [{ data: business }, { data: userData }, access] = await Promise.all([
    supabase.from("businesses").select("owner_id").eq("id", businessId).single(),
    supabase.auth.getUser(),
    getSubscriptionAccess(supabase, businessId),
  ]);

  if (!business) notFound();

  if (!userData.user) redirect("/login");

  const isOwner = business.owner_id === userData.user.id;

  if (!isOwner) {
    const { data: staff } = await supabase
      .from("business_staff")
      .select("permissions, active")
      .eq("business_id", businessId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!staff || !staff.active || !(staff.permissions as string[]).includes("pos")) {
      return <AccessDenied businessId={businessId} />;
    }
  }

  if (access.locked) {
    redirect(`/business/${businessId}/billing`);
  }

  return children;
}
