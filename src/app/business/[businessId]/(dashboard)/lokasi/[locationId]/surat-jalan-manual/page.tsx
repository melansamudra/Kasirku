import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CreateManualDnForm from "./create-form";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SuratJalanManualPage({
  params,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
}) {
  const { businessId, locationId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled")
    .eq("id", businessId)
    .single();
  if (!business || !business.cost_control_enabled) notFound();

  const { data: location } = await supabase
    .from("stock_locations")
    .select("id, name, is_default_purchase")
    .eq("id", locationId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!location) notFound();

  const { data: notes } = await supabase
    .from("manual_delivery_notes")
    .select("id, dn_number, destination, created_by_name, created_at")
    .eq("business_id", businessId)
    .eq("location_id", locationId)
    .order("created_at", { ascending: false })
    .limit(100);

  const dnIds = (notes ?? []).map((n) => n.id);
  const itemCountByDn = new Map<string, number>();
  if (dnIds.length > 0) {
    const { data: items } = await supabase
      .from("manual_delivery_note_items")
      .select("manual_delivery_note_id")
      .in("manual_delivery_note_id", dnIds);
    for (const it of items ?? []) {
      itemCountByDn.set(it.manual_delivery_note_id, (itemCountByDn.get(it.manual_delivery_note_id) ?? 0) + 1);
    }
  }

  return (
    <div className="w-full max-w-2xl">
      <Link
        href={`/business/${businessId}/lokasi/${locationId}/bahan-baku`}
        className="text-xs text-zinc-400 hover:text-brand-600"
      >
        ← {location.name}
      </Link>
      <h1 className="mt-2 text-lg font-bold text-zinc-900">Surat Jalan Manual — {location.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Buat &amp; cetak Surat Jalan bebas isi sendiri, terpisah dari alur otomatis Permintaan Barang/PO.
      </p>

      <div className="mt-4">
        <CreateManualDnForm businessId={businessId} locationId={locationId} />
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">Riwayat Surat Jalan</h2>
        {notes && notes.length > 0 ? (
          <div className="space-y-2">
            {notes.map((n) => (
              <Link
                key={n.id}
                href={`/business/${businessId}/lokasi/${locationId}/surat-jalan-manual/${n.id}`}
                className="block rounded-xl border border-zinc-200 bg-white px-4 py-3 hover:border-brand-300"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-900">{n.dn_number}</p>
                  <p className="text-[10.5px] text-zinc-400">{formatDateTime(n.created_at)}</p>
                </div>
                <p className="text-xs text-zinc-500">
                  Ke {n.destination} — {itemCountByDn.get(n.id) ?? 0} barang
                </p>
                {n.created_by_name && <p className="text-[10.5px] text-zinc-400">Oleh {n.created_by_name}</p>}
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada Surat Jalan manual yang dibuat.
          </p>
        )}
      </div>
    </div>
  );
}
