import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProductionSession } from "@/lib/production-session";
import ReceiveListClient from "./receive-list-client";

type PortalHome = {
  business_id: string;
  receive_stock_slug: string | null;
  location: { id: string; name: string } | null;
};

type ReceiveStockInfo = {
  pending?: { id: string; item_name: string; unit: string | null; qty: number; marked_at: string }[];
};

export default async function PortalTerimaPage({
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

  const session = await getProductionSession(info.business_id, info.location.id);
  if (!session) {
    redirect(`/portal-lokasi/${slug}`);
  }

  if (!info.receive_stock_slug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <p className="text-sm text-zinc-500">Link Terima Barang belum tersedia untuk bisnis ini.</p>
      </div>
    );
  }

  const { data: receiveData } = await supabase.rpc("get_receive_stock_info", {
    p_slug: info.receive_stock_slug,
    p_location_id: info.location.id,
  });
  const receiveInfo = receiveData as unknown as ReceiveStockInfo | null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
        <Link href={`/portal-lokasi/${slug}`} className="text-xs text-zinc-400 hover:text-brand-600">
          ← {info.location.name}
        </Link>
        <h1 className="mt-2 text-lg font-bold text-zinc-900">📦 Terima Barang dari Gudang</h1>
        <p className="mt-1 text-[11px] text-zinc-400">Sebagai {session.name}</p>

        <ReceiveListClient
          receiveSlug={info.receive_stock_slug}
          businessId={info.business_id}
          locationId={info.location.id}
          pending={receiveInfo?.pending ?? []}
        />
      </div>
    </div>
  );
}
