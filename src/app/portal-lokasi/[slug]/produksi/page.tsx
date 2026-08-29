import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProductionSession } from "@/lib/production-session";
import ProduksiFormClient from "./produksi-form-client";

type PortalHome = {
  business_id: string;
  production_scan_slug: string | null;
  location: { id: string; name: string; is_production: boolean } | null;
};

type RecipeLine = { name: string; qtyPerUnit: number; unit: string; availableStock: number };
type ProductionScanInfo = {
  items: { id: string; name: string; unit: string; stock: number; recipe: RecipeLine[] }[];
  ingredients: { id: string; name: string; unit: string }[];
};

export default async function PortalProduksiPage({
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
  if (!info.location.is_production) notFound();
  const location = info.location;

  const session = await getProductionSession(info.business_id, location.id);
  if (!session) {
    redirect(`/portal-lokasi/${slug}`);
  }

  if (!info.production_scan_slug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <p className="text-sm text-zinc-500">Link Produksi belum tersedia untuk bisnis ini.</p>
      </div>
    );
  }

  const { data: scanData } = await supabase.rpc("get_production_scan_info", {
    p_slug: info.production_scan_slug,
  });
  const scanInfo = scanData as unknown as ProductionScanInfo | null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
        <Link href={`/portal-lokasi/${slug}`} className="text-xs text-zinc-400 hover:text-brand-600">
          ← {location.name}
        </Link>
        <h1 className="mt-2 text-lg font-bold text-zinc-900">🏭 Catat Produksi</h1>
        <p className="mt-1 text-[11px] text-zinc-400">Sebagai {session.name}</p>

        <ProduksiFormClient
          productionScanSlug={info.production_scan_slug}
          businessId={info.business_id}
          locationId={location.id}
          items={scanInfo?.items ?? []}
          ingredients={scanInfo?.ingredients ?? []}
        />
      </div>
    </div>
  );
}
