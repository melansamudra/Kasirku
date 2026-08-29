import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProductionSession } from "@/lib/production-session";
import TransferFulfillClient from "./transfer-fulfill-client";

type PortalHome = {
  business_id: string;
  location: { id: string; name: string; is_production: boolean } | null;
};

type TransferItem = { id: string; item_name: string; unit: string; qty_requested: number };
type Transfer = {
  id: string;
  to_location_name: string;
  requested_by_name: string;
  note: string | null;
  created_at: string;
  items: TransferItem[];
};

export default async function PortalKirimPage({
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

  const { data: transfersData } = await supabase.rpc("get_location_portal_transfers", { p_slug: slug });
  const transfers = (transfersData as unknown as { transfers: Transfer[] } | null)?.transfers ?? [];

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
        <Link href={`/portal-lokasi/${slug}`} className="text-xs text-zinc-400 hover:text-brand-600">
          ← {location.name}
        </Link>
        <h1 className="mt-2 text-lg font-bold text-zinc-900">🚚 Kirim Bahan Setengah Jadi</h1>
        <p className="mt-1 text-[11px] text-zinc-400">Sebagai {session.name}</p>

        <div className="mt-4 space-y-3">
          {transfers.length > 0 ? (
            transfers.map((t) => (
              <div key={t.id} className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/40">
                <div className="px-4 py-3">
                  <p className="text-sm font-semibold text-zinc-900">{t.to_location_name}</p>
                  <p className="text-[11px] text-zinc-500">
                    {t.requested_by_name}
                    {t.note ? ` · ${t.note}` : ""}
                  </p>
                </div>
                <TransferFulfillClient
                  slug={slug}
                  businessId={info.business_id}
                  locationId={location.id}
                  transferId={t.id}
                  items={t.items}
                />
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Tidak ada permintaan yang menunggu.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
