import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProductionSession } from "@/lib/production-session";
import PinScreen from "./pin-screen";
import LogoutButton from "./logout-button";

type PortalHome = {
  business_id: string;
  business_name: string;
  stock_opname_slug: string | null;
  location: { id: string; name: string; is_production: boolean; is_default_purchase: boolean } | null;
  employees?: { id: string; name: string }[];
  pending_transfer_count?: number;
  pending_receive_count?: number;
};

function LinkBelumDiarahkan() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-zinc-900">Link belum diarahkan ke lokasi</p>
        <p className="mt-1.5 text-xs text-zinc-500">
          Minta admin kirim ulang link portal yang benar (harus ada bagian &quot;?lokasi=...&quot; di
          alamatnya).
        </p>
      </div>
    </div>
  );
}

export default async function PortalLokasiPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lokasi?: string }>;
}) {
  const { slug } = await params;
  const { lokasi } = await searchParams;
  const supabase = await createClient();

  if (!lokasi) {
    return <LinkBelumDiarahkan />;
  }

  const { data } = await supabase.rpc("get_location_portal_home", { p_slug: slug, p_location_id: lokasi });
  if (!data) {
    notFound();
  }
  const info = data as unknown as PortalHome;

  if (!info.location) {
    return <LinkBelumDiarahkan />;
  }

  const session = await getProductionSession(info.business_id, info.location.id);

  if (!session) {
    return (
      <PinScreen
        slug={slug}
        businessId={info.business_id}
        locationId={info.location.id}
        businessName={info.business_name}
        locationName={info.location.name}
        employees={info.employees ?? []}
      />
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {info.business_name}
        </p>
        <h1 className="mt-1 text-center text-lg font-bold text-zinc-900">{info.location.name}</h1>
        <p className="mt-1 text-center text-[11px] text-zinc-400">Masuk sebagai {session.name}</p>

        <div className="mt-5 space-y-2.5">
          {info.location.is_production && (
            <Link
              href={`/portal-lokasi/${slug}/kirim?lokasi=${info.location.id}`}
              className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 px-4 py-3.5 hover:border-brand-300 hover:bg-brand-50/30"
            >
              <span className="flex items-center gap-2.5">
                <span className="text-xl">🚚</span>
                <span className="text-sm font-medium text-zinc-800">Kirim Bahan Setengah Jadi</span>
              </span>
              {!!info.pending_transfer_count && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  {info.pending_transfer_count}
                </span>
              )}
            </Link>
          )}

          <Link
            href={`/portal-lokasi/${slug}/terima?lokasi=${info.location.id}`}
            className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 px-4 py-3.5 hover:border-brand-300 hover:bg-brand-50/30"
          >
            <span className="flex items-center gap-2.5">
              <span className="text-xl">📦</span>
              <span className="text-sm font-medium text-zinc-800">Terima Barang dari Gudang</span>
            </span>
            {!!info.pending_receive_count && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                {info.pending_receive_count}
              </span>
            )}
          </Link>

          {info.stock_opname_slug && (
            <Link
              href={`/stok-opname/${info.stock_opname_slug}?lokasi=${info.location.id}`}
              className="flex items-center gap-2.5 rounded-xl border border-zinc-200 px-4 py-3.5 hover:border-brand-300 hover:bg-brand-50/30"
            >
              <span className="text-xl">📋</span>
              <span className="text-sm font-medium text-zinc-800">Stok Opname</span>
            </Link>
          )}
        </div>

        <div className="mt-6 text-center">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
