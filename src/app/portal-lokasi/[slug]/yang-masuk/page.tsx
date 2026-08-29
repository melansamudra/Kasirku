import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProductionSession } from "@/lib/production-session";

type PortalHome = {
  business_id: string;
  location: { id: string; name: string; is_default_purchase: boolean } | null;
};

type IncomingRequest = {
  id: string;
  pr_number: string | null;
  employee_name: string;
  location_name: string | null;
  created_at: string;
  note: string | null;
  item_count: number;
  pending_count: number;
};

type PendingPo = {
  id: string;
  po_number: string;
  supplier_name: string | null;
  outstanding_count: number;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function PortalYangMasukPage({
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

  const { data: incomingData } = await supabase.rpc("get_purchasing_portal_incoming", { p_slug: slug });
  const incoming = incomingData as unknown as { incoming_requests: IncomingRequest[]; pending_pos: PendingPo[] } | null;
  const requests = incoming?.incoming_requests ?? [];
  const pos = incoming?.pending_pos ?? [];

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
        <Link href={`/portal-lokasi/${slug}`} className="text-xs text-zinc-400 hover:text-brand-600">
          ← {location.name}
        </Link>
        <h1 className="mt-2 text-lg font-bold text-zinc-900">📋 Yang Masuk</h1>
        <p className="mt-1 text-[11px] text-zinc-400">
          Cuma buat dilihat — proses (alokasi supplier, approve, GRN) tetap lewat dashboard login.
        </p>

        <div className="mt-4">
          <h2 className="text-xs font-semibold text-zinc-600">Permintaan Barang belum diproses</h2>
          {requests.length > 0 ? (
            <div className="mt-2 space-y-2">
              {requests.map((r) => (
                <div key={r.id} className="rounded-xl border border-zinc-200 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-zinc-900">{r.location_name ?? "(tanpa lokasi)"}</p>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                      {r.pending_count}/{r.item_count} belum diproses
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {r.employee_name} · {formatDate(r.created_at)}
                    {r.pr_number ? ` · ${r.pr_number}` : ""}
                  </p>
                  {r.note && <p className="mt-1 text-[11px] text-zinc-400">{r.note}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 rounded-xl border border-dashed border-zinc-200 px-3 py-4 text-center text-xs text-zinc-400">
              Tidak ada Permintaan Barang yang menunggu diproses.
            </p>
          )}
        </div>

        <div className="mt-5">
          <h2 className="text-xs font-semibold text-zinc-600">PO menunggu diterima dari supplier</h2>
          {pos.length > 0 ? (
            <div className="mt-2 space-y-2">
              {pos.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-xl border border-zinc-200 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{p.po_number}</p>
                    <p className="text-[11px] text-zinc-500">{p.supplier_name ?? "—"}</p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                    {p.outstanding_count} barang belum diterima
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 rounded-xl border border-dashed border-zinc-200 px-3 py-4 text-center text-xs text-zinc-400">
              Tidak ada PO yang menunggu diterima.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
