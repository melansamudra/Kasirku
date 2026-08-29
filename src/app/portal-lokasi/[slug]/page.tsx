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
  production_scan_slug: string | null;
  purchase_request_slug: string | null;
  location: { id: string; name: string; is_production: boolean; is_default_purchase: boolean } | null;
  employees?: { id: string; name: string }[];
  pending_transfer_count?: number;
  pending_receive_count?: number;
};

export default async function PortalLokasiPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // Slug 1x per LOKASI (bukan per bisnis lagi) -- ketemu langsung resolve
  // lokasi + businessnya, jadi kalau slug ini ada di DB, `location` di
  // respons RPC dijamin tidak pernah null.
  const { data } = await supabase.rpc("get_location_portal_home", { p_slug: slug });
  if (!data) {
    notFound();
  }
  const info = data as unknown as PortalHome;
  if (!info.location) {
    notFound();
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
          {info.location.is_production && info.production_scan_slug && (
            <Link
              href={`/portal-lokasi/${slug}/produksi`}
              className="flex items-center gap-2.5 rounded-xl border border-zinc-200 px-4 py-3.5 hover:border-brand-300 hover:bg-brand-50/30"
            >
              <span className="text-xl">🏭</span>
              <span className="text-sm font-medium text-zinc-800">Catat Produksi</span>
            </Link>
          )}

          {info.location.is_production && (
            <Link
              href={`/portal-lokasi/${slug}/kirim`}
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

          {/* Gudang Utama/Purchasing tidak "terima dari dirinya sendiri" dan
              tim Purchasing sudah punya akses dashboard langsung buat proses
              PR -- 2 tile ini cuma relevan buat lokasi peminta lain. */}
          {!info.location.is_default_purchase && (
            <Link
              href={`/portal-lokasi/${slug}/terima`}
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
          )}

          {info.purchase_request_slug && !info.location.is_default_purchase && (
            <Link
              href={`/portal-lokasi/${slug}/permintaan-barang`}
              className="flex items-center gap-2.5 rounded-xl border border-zinc-200 px-4 py-3.5 hover:border-brand-300 hover:bg-brand-50/30"
            >
              <span className="text-xl">📝</span>
              <span className="text-sm font-medium text-zinc-800">Permintaan Barang</span>
            </Link>
          )}

          {info.location.is_default_purchase && (
            <Link
              href={`/portal-lokasi/${slug}/yang-masuk`}
              className="flex items-center gap-2.5 rounded-xl border border-zinc-200 px-4 py-3.5 hover:border-brand-300 hover:bg-brand-50/30"
            >
              <span className="text-xl">📋</span>
              <span className="text-sm font-medium text-zinc-800">Yang Masuk (PR &amp; PO)</span>
            </Link>
          )}

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
