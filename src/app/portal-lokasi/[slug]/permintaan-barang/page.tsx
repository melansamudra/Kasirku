import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProductionSession } from "@/lib/production-session";
import OrderFormClient from "./order-form-client";

type PortalHome = {
  business_id: string;
  purchase_request_slug: string | null;
  location: { id: string; name: string } | null;
};

type PurchaseRequestInfo = {
  business_type: string;
  items: {
    id: string;
    name: string;
    unit: string;
    stock: number;
    department: string | null;
    barcode: string | null;
    purchase_units: { unitName: string; conversion: number }[];
  }[];
};

export default async function PortalPermintaanBarangPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lokasi?: string }>;
}) {
  const { slug } = await params;
  const { lokasi } = await searchParams;
  const supabase = await createClient();

  if (!lokasi) notFound();

  const { data } = await supabase.rpc("get_location_portal_home", { p_slug: slug, p_location_id: lokasi });
  if (!data) notFound();
  const info = data as unknown as PortalHome;
  if (!info.location) notFound();
  const location = info.location;

  const session = await getProductionSession(info.business_id, location.id);
  if (!session) {
    redirect(`/portal-lokasi/${slug}?lokasi=${lokasi}`);
  }

  if (!info.purchase_request_slug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <p className="text-sm text-zinc-500">Link Permintaan Barang belum tersedia untuk bisnis ini.</p>
      </div>
    );
  }

  const { data: prData } = await supabase.rpc("get_purchase_request_info", {
    p_slug: info.purchase_request_slug,
  });
  const prInfo = prData as unknown as PurchaseRequestInfo | null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
        <Link
          href={`/portal-lokasi/${slug}?lokasi=${lokasi}`}
          className="text-xs text-zinc-400 hover:text-brand-600"
        >
          ← {location.name}
        </Link>
        <h1 className="mt-2 text-lg font-bold text-zinc-900">📝 Permintaan Barang</h1>
        <p className="mt-1 text-[11px] text-zinc-400">Sebagai {session.name}</p>

        <OrderFormClient
          purchaseRequestSlug={info.purchase_request_slug}
          businessId={info.business_id}
          locationId={location.id}
          isFnb={prInfo?.business_type === "fnb"}
          items={(prInfo?.items ?? []).map((i) => ({
            id: i.id,
            name: i.name,
            unit: i.unit,
            stock: i.stock,
            department: i.department,
            barcode: i.barcode,
            purchaseUnits: i.purchase_units ?? [],
          }))}
        />
      </div>
    </div>
  );
}
