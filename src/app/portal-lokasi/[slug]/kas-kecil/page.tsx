import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProductionSession } from "@/lib/production-session";
import KasKecilFormClient from "./kas-kecil-form-client";

type PortalHome = {
  business_id: string;
  location: { id: string; name: string; is_default_purchase: boolean } | null;
};

export default async function PortalKasKecilPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_location_portal_home", { p_slug: slug });
  if (!data) notFound();
  const info = data as unknown as PortalHome;
  if (!info.location) notFound();
  if (!info.location.is_default_purchase) notFound();
  const location = info.location;

  const session = await getProductionSession(info.business_id, location.id);
  if (!session) {
    redirect(`/portal-lokasi/${slug}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
        <Link href={`/portal-lokasi/${slug}`} className="text-xs text-zinc-400 hover:text-brand-600">
          ← {location.name}
        </Link>
        <h1 className="mt-2 text-lg font-bold text-zinc-900">💰 Catat Kas Kecil</h1>
        <p className="mt-1 text-[11px] text-zinc-400">
          Sebagai {session.name} — cuma untuk pengeluaran tunai (Nota Hutang &amp; Kasbon tetap lewat dashboard).
        </p>

        <KasKecilFormClient portalSlug={slug} businessId={info.business_id} locationId={location.id} />
      </div>
    </div>
  );
}
