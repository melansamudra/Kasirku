import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProductionSession } from "@/lib/production-session";

type PortalHome = {
  business_id: string;
  location: { id: string; name: string; is_production: boolean } | null;
};

type TransferHistoryItem = {
  id: string;
  dn_number: string | null;
  to_location_name: string;
  fulfilled_by_name: string | null;
  fulfilled_at: string;
  item_count: number;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function PortalKirimRiwayatPage({
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

  const { data: historyData } = await supabase.rpc("get_location_portal_transfer_history", { p_slug: slug });
  const transfers = (historyData as unknown as { transfers: TransferHistoryItem[] } | null)?.transfers ?? [];

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-sm">
        <Link href={`/portal-lokasi/${slug}/kirim`} className="text-xs text-zinc-400 hover:text-brand-600">
          ← Kirim Bahan Setengah Jadi
        </Link>
        <h1 className="mt-2 text-lg font-bold text-zinc-900">📜 Riwayat Kirim</h1>
        <p className="mt-1 text-[11px] text-zinc-400">
          Semua pengiriman yang sudah selesai — buka buat cetak ulang Surat Jalan.
        </p>

        <div className="mt-4 space-y-2">
          {transfers.length > 0 ? (
            transfers.map((t) => (
              <Link
                key={t.id}
                href={`/portal-lokasi/${slug}/kirim/riwayat/${t.id}/cetak`}
                className="block rounded-xl border border-zinc-200 px-3.5 py-3 hover:border-brand-300 hover:bg-brand-50/30"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-zinc-900">{t.to_location_name}</p>
                  <span className="text-[11px] font-medium text-brand-600">🖨️ Cetak</span>
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {t.dn_number ?? "—"} · {t.item_count} bahan · {formatDateTime(t.fulfilled_at)}
                </p>
                {t.fulfilled_by_name && <p className="mt-0.5 text-[10px] text-zinc-400">Oleh {t.fulfilled_by_name}</p>}
              </Link>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada pengiriman yang selesai.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
