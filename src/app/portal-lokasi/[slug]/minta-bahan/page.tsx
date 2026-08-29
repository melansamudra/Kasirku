import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProductionSession } from "@/lib/production-session";
import MintaBahanFormClient from "./minta-bahan-form-client";

type PortalHome = {
  business_id: string;
  location_transfer_slug: string | null;
  location: { id: string; name: string; is_production: boolean; is_default_purchase: boolean } | null;
};

type TransferInfo = {
  semi_finished_items: { id: string; name: string; unit: string }[];
};

export default async function PortalMintaBahanPage({
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
  // Cuma lokasi non-produksi & non-Gudang (Kitchen/Bar) yang MINTA bahan --
  // sisi Dapur Produksi (yang KIRIM) sudah ada tile terpisah "Kirim Bahan
  // Setengah Jadi".
  if (info.location.is_production || info.location.is_default_purchase) notFound();
  const location = info.location;

  const session = await getProductionSession(info.business_id, location.id);
  if (!session) {
    redirect(`/portal-lokasi/${slug}`);
  }

  if (!info.location_transfer_slug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <p className="text-sm text-zinc-500">Link Minta Bahan belum tersedia untuk bisnis ini.</p>
      </div>
    );
  }

  const { data: transferData } = await supabase.rpc("get_location_transfer_info", {
    p_slug: info.location_transfer_slug,
  });
  const transferInfo = transferData as unknown as TransferInfo | null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
        <Link href={`/portal-lokasi/${slug}`} className="text-xs text-zinc-400 hover:text-brand-600">
          ← {location.name}
        </Link>
        <h1 className="mt-2 text-lg font-bold text-zinc-900">🥡 Minta Bahan ke Dapur Produksi</h1>
        <p className="mt-1 text-[11px] text-zinc-400">Sebagai {session.name}</p>

        <MintaBahanFormClient
          locationTransferSlug={info.location_transfer_slug}
          businessId={info.business_id}
          locationId={location.id}
          semiFinishedItems={transferInfo?.semi_finished_items ?? []}
        />
      </div>
    </div>
  );
}
