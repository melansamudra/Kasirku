import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import RequestLinksBox from "./request-links-box";
import FulfillForm from "./fulfill-form";
import OwnRequestLinkBox from "./own-link-box";

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

export default async function LocationTransferPage({
  params,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
}) {
  const { businessId, locationId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, rich_stock_ops_enabled, location_transfer_slug")
    .eq("id", businessId)
    .single();
  if (!business || !(business.cost_control_enabled || business.rich_stock_ops_enabled)) {
    notFound();
  }

  const { data: location } = await supabase
    .from("stock_locations")
    .select("id, name, is_production, is_default_purchase, portal_slug")
    .eq("id", locationId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!location) {
    notFound();
  }

  // Lokasi non-produksi (Kitchen Atas/Bar Llauk) -- ini sisi PEMINTA,
  // kebalikan dari halaman Dapur Produksi di bawah (sisi PENGIRIM). Tidak
  // ada FulfillForm di sini, cuma link permintaan milik lokasi ini +
  // riwayat status permintaan yang sudah dibuat (baru/dikirim).
  if (!location.is_production) {
    const [{ data: ownPending }, { data: ownHistory }] = await Promise.all([
      supabase
        .from("location_transfers")
        .select("id, requested_by_name, note, created_at")
        .eq("business_id", businessId)
        .eq("to_location_id", locationId)
        .eq("status", "baru")
        .order("created_at", { ascending: false }),
      supabase
        .from("location_transfers")
        .select("id, requested_by_name, note, created_at, fulfilled_at")
        .eq("business_id", businessId)
        .eq("to_location_id", locationId)
        .eq("status", "dikirim")
        .order("fulfilled_at", { ascending: false })
        .limit(50),
    ]);

    const ownTransferIds = [...(ownPending ?? []), ...(ownHistory ?? [])].map((t) => t.id);
    const { data: ownItems } = ownTransferIds.length
      ? await supabase
          .from("location_transfer_items")
          .select("id, transfer_id, item_name, unit, qty_requested, qty_sent")
          .in("transfer_id", ownTransferIds)
      : { data: [] };
    const ownItemsByTransfer = new Map<string, typeof ownItems>();
    for (const it of ownItems ?? []) {
      const list = ownItemsByTransfer.get(it.transfer_id) ?? [];
      list.push(it);
      ownItemsByTransfer.set(it.transfer_id, list);
    }

    return (
      <div className="w-full max-w-2xl">
        <Link
          href={`/business/${businessId}/lokasi/${locationId}/bahan-baku`}
          className="text-xs text-zinc-400 hover:text-brand-600"
        >
          ← {location.name}
        </Link>
        <h1 className="mt-2 text-lg font-bold text-zinc-900">Transfer Internal — {location.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Minta bahan setengah jadi ke Dapur Produksi lewat link di bawah — status permintaan
          kelihatan di sini.
        </p>

        <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Link Permintaan</h2>
          <OwnRequestLinkBox
            businessId={businessId}
            locationId={locationId}
            initialSlug={business.location_transfer_slug ?? ""}
          />
        </div>

        <div className="mt-6 space-y-3">
          <h2 className="text-sm font-bold text-amber-700">⏳ Menunggu Dikirim Dapur Produksi</h2>
          {ownPending && ownPending.length > 0 ? (
            ownPending.map((t) => (
              <div key={t.id} className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/40">
                <div className="px-4 py-3">
                  <p className="text-[11px] text-zinc-500">
                    {t.requested_by_name} · {formatDateTime(t.created_at)}
                    {t.note ? ` · ${t.note}` : ""}
                  </p>
                </div>
                <div className="divide-y divide-amber-100 bg-white px-4 py-1">
                  {(ownItemsByTransfer.get(t.id) ?? []).map((i) => (
                    <p key={i.id} className="py-1.5 text-xs text-zinc-700">
                      {i.item_name} <span className="text-zinc-400">({i.qty_requested} {i.unit})</span>
                    </p>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Tidak ada permintaan yang menunggu.
            </p>
          )}
        </div>

        <div className="mt-6">
          <h2 className="mb-2 text-sm font-bold text-zinc-900">Riwayat Diterima</h2>
          {ownHistory && ownHistory.length > 0 ? (
            <div className="space-y-2">
              {ownHistory.map((t) => (
                <div key={t.id} className="rounded-xl bg-white shadow-sm px-4 py-3">
                  <p className="text-[11px] text-zinc-400">
                    {t.requested_by_name} · diterima {t.fulfilled_at ? formatDateTime(t.fulfilled_at) : "-"}
                  </p>
                  <div className="mt-1.5 space-y-0.5">
                    {(ownItemsByTransfer.get(t.id) ?? []).map((i) => (
                      <p key={i.id} className="text-[11px] text-zinc-500">
                        {i.item_name}: diminta {i.qty_requested} {i.unit}
                        {i.qty_sent != null ? `, diterima ${i.qty_sent} ${i.unit}` : " — tidak dikirim"}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada permintaan yang diterima.
            </p>
          )}
        </div>
      </div>
    );
  }

  const { data: otherLocations } = await supabase
    .from("stock_locations")
    .select("id, name, is_default_purchase")
    .eq("business_id", businessId)
    .neq("id", locationId);
  const requestingLocations = (otherLocations ?? []).filter((l) => !l.is_default_purchase);

  const { data: pendingTransfers } = await supabase
    .from("location_transfers")
    .select("id, to_location_id, requested_by_name, note, created_at")
    .eq("business_id", businessId)
    .eq("from_location_id", locationId)
    .eq("status", "baru")
    .order("created_at", { ascending: true });

  const { data: history } = await supabase
    .from("location_transfers")
    .select("id, to_location_id, requested_by_name, note, created_at, fulfilled_at, dn_number")
    .eq("business_id", businessId)
    .eq("from_location_id", locationId)
    .eq("status", "dikirim")
    .order("fulfilled_at", { ascending: false })
    .limit(50);

  const locationNameById = new Map((otherLocations ?? []).map((l) => [l.id, l.name]));

  const transferIds = [...(pendingTransfers ?? []), ...(history ?? [])].map((t) => t.id);
  const { data: allItems } = transferIds.length
    ? await supabase
        .from("location_transfer_items")
        .select("id, transfer_id, item_name, unit, qty_requested, qty_sent")
        .in("transfer_id", transferIds)
    : { data: [] };
  const itemsByTransfer = new Map<string, typeof allItems>();
  for (const it of allItems ?? []) {
    const list = itemsByTransfer.get(it.transfer_id) ?? [];
    list.push(it);
    itemsByTransfer.set(it.transfer_id, list);
  }

  return (
    <div className="w-full max-w-2xl">
      <Link
        href={`/business/${businessId}/lokasi/${locationId}/bahan-baku`}
        className="text-xs text-zinc-400 hover:text-brand-600"
      >
        ← {location.name}
      </Link>
      <h1 className="mt-2 text-lg font-bold text-zinc-900">Transfer Internal — {location.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Permintaan Bahan Setengah Jadi dari Kitchen Llauk/Bar Llauk — proses & kirim dari sini.
      </p>

      {requestingLocations.length > 0 && (
        <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Link Permintaan</h2>
          <RequestLinksBox
            businessId={businessId}
            locationId={locationId}
            initialSlug={business.location_transfer_slug ?? ""}
            requestingLocations={requestingLocations}
          />
        </div>
      )}

      <div className="mt-6 space-y-3">
        <h2 className="text-sm font-bold text-amber-700">⏳ Menunggu Dikirim</h2>
        {pendingTransfers && pendingTransfers.length > 0 ? (
          pendingTransfers.map((t) => (
            <div key={t.id} className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/40">
              <div className="px-4 py-3">
                <p className="text-sm font-semibold text-zinc-900">
                  {locationNameById.get(t.to_location_id) ?? "Lokasi lain"}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {t.requested_by_name} · {formatDateTime(t.created_at)}
                  {t.note ? ` · ${t.note}` : ""}
                </p>
              </div>
              <FulfillForm
                businessId={businessId}
                locationId={locationId}
                transferId={t.id}
                items={(itemsByTransfer.get(t.id) ?? []).map((i) => ({
                  id: i.id,
                  item_name: i.item_name,
                  unit: i.unit,
                  qty_requested: Number(i.qty_requested),
                }))}
              />
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Tidak ada permintaan yang menunggu.
          </p>
        )}
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-bold text-zinc-900">Riwayat Terkirim</h2>
        {history && history.length > 0 ? (
          <div className="space-y-2">
            {history.map((t) => (
              <div key={t.id} className="rounded-xl bg-white shadow-sm px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-900">
                    {locationNameById.get(t.to_location_id) ?? "Lokasi lain"}
                  </p>
                  {location.portal_slug && (
                    <Link
                      href={`/portal-lokasi/${location.portal_slug}/kirim/riwayat/${t.id}/cetak`}
                      target="_blank"
                      className="text-[11px] font-medium text-brand-600 hover:underline"
                    >
                      🖨️ Cetak Surat Jalan
                    </Link>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400">
                  {t.dn_number ? `${t.dn_number} · ` : ""}
                  {t.requested_by_name} · dikirim {t.fulfilled_at ? formatDateTime(t.fulfilled_at) : "-"}
                </p>
                <div className="mt-1.5 space-y-0.5">
                  {(itemsByTransfer.get(t.id) ?? []).map((i) => (
                    <p key={i.id} className="text-[11px] text-zinc-500">
                      {i.item_name}: diminta {i.qty_requested} {i.unit}
                      {i.qty_sent != null ? `, dikirim ${i.qty_sent} ${i.unit}` : " — tidak dikirim"}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada transfer yang terkirim.
          </p>
        )}
      </div>
    </div>
  );
}
