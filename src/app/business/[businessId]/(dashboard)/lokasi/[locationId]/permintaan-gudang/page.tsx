import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/pagination";
import { hasStockLocationAccess } from "@/lib/cost-control/has-stock-access";
import {
  submitWarehouseRequest,
  createWarehouseDeliveryNote,
  receiveWarehouseDeliveryNoteItem,
} from "./actions";
import RequestForm from "./request-form";
import CurateRequestForm from "./curate-request-form";
import DirectSendForm from "./direct-send-form";
import ReceiveItemForm from "./receive-item-form";

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

export default async function PermintaanGudangPage({
  params,
}: {
  params: Promise<{ businessId: string; locationId: string }>;
}) {
  const { businessId, locationId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, cost_control_enabled, stock_locations_enabled, rich_stock_ops_enabled")
    .eq("id", businessId)
    .single();
  if (!business || !hasStockLocationAccess(business)) notFound();

  const { data: location } = await supabase
    .from("stock_locations")
    .select("id, name, is_default_purchase, is_production, warehouse_mode")
    .eq("id", locationId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!location) notFound();

  const { data: employeeRows } = await supabase
    .from("employees")
    .select("id, name")
    .eq("business_id", businessId)
    .eq("active", true)
    .order("name");
  const employees = employeeRows ?? [];

  const isPureWarehouse = location.is_default_purchase && !location.is_production;
  const isStandaloneWarehouse = isPureWarehouse && location.warehouse_mode === "standalone";

  const { data: allLocations } = await supabase
    .from("stock_locations")
    .select("id, name, is_default_purchase, is_production, warehouse_mode")
    .eq("business_id", businessId)
    .order("sort_order", { ascending: true });
  const locationById = new Map((allLocations ?? []).map((l) => [l.id, l]));

  if (isStandaloneWarehouse) {
    const [{ data: warehouseItemRows }, requestRows] = await Promise.all([
      supabase
        .from("warehouse_items")
        .select("id, name, unit, stock")
        .eq("business_id", businessId)
        .eq("location_id", locationId)
        .order("name", { ascending: true }),
      fetchAllRows<{
        id: string;
        request_number: string;
        to_location_id: string;
        requested_by_name: string;
        note: string | null;
        created_at: string;
      }>((from, to) =>
        supabase
          .from("warehouse_requests")
          .select("id, request_number, to_location_id, requested_by_name, note, created_at")
          .eq("business_id", businessId)
          .eq("from_location_id", locationId)
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
    ]);

    const warehouseItems = (warehouseItemRows ?? []).map((r) => ({ ...r, stock: Number(r.stock) }));

    const requestIds = requestRows.map((r) => r.id);
    const requestItemRows =
      requestIds.length > 0
        ? await fetchAllRows<{
            id: string;
            warehouse_request_id: string;
            item_name: string;
            unit: string | null;
            qty_requested: number;
            qty_sent: number;
          }>((from, to) =>
            supabase
              .from("warehouse_request_items")
              .select("id, warehouse_request_id, item_name, unit, qty_requested, qty_sent")
              .in("warehouse_request_id", requestIds)
              .range(from, to),
          )
        : [];
    const itemsByRequest = new Map<string, typeof requestItemRows>();
    for (const it of requestItemRows) {
      const list = itemsByRequest.get(it.warehouse_request_id) ?? [];
      list.push(it);
      itemsByRequest.set(it.warehouse_request_id, list);
    }

    const pendingRequests = requestRows.filter((r) =>
      (itemsByRequest.get(r.id) ?? []).some((it) => Number(it.qty_requested) - Number(it.qty_sent) > 0.001),
    );
    const completedRequests = requestRows.filter((r) => !pendingRequests.includes(r));

    const directSendTargets = (allLocations ?? [])
      .filter((l) => l.id !== locationId)
      .map((l) => ({ id: l.id, name: l.name }));

    return (
      <div className="w-full max-w-2xl">
        <p className="text-xs text-zinc-400">
          <Link href={`/business/${businessId}/lokasi/${locationId}/bahan-baku`} className="hover:text-brand-600 hover:underline">
            Bahan Gudang
          </Link>{" "}
          · Permintaan &amp; Surat Jalan
        </p>
        <h1 className="mt-1 text-lg font-bold text-zinc-900">Permintaan Masuk — {location.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Permintaan dari Kitchen/Bar. Pilih barang &amp; qty yang benar-benar mau dikirim, lalu buat Surat
          Jalan — stok Gudang otomatis berkurang saat itu.
        </p>

        <DirectSendForm
          toLocations={directSendTargets}
          warehouseItems={warehouseItems}
          employees={employees}
          action={createWarehouseDeliveryNote.bind(null, businessId, locationId)}
        />

        <div className="mt-4 space-y-3">
          {pendingRequests.length > 0 ? (
            pendingRequests.map((r) => {
              const toLoc = locationById.get(r.to_location_id);
              const items = itemsByRequest.get(r.id) ?? [];
              return (
                <div key={r.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-900">
                      {r.request_number} — ke {toLoc?.name ?? "—"}
                    </p>
                    <p className="text-[11px] text-zinc-400">{formatDateTime(r.created_at)}</p>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    oleh {r.requested_by_name}
                    {r.note ? ` · ${r.note}` : ""}
                  </p>
                  <CurateRequestForm
                    requestId={r.id}
                    toLocationId={r.to_location_id}
                    toLocationName={toLoc?.name ?? "—"}
                    items={items.map((it) => ({
                      id: it.id,
                      itemName: it.item_name,
                      unit: it.unit,
                      qtyRequested: Number(it.qty_requested),
                      qtySent: Number(it.qty_sent),
                    }))}
                    warehouseItems={warehouseItems}
                    employees={employees}
                    action={createWarehouseDeliveryNote.bind(null, businessId, locationId, r.to_location_id)}
                  />
                </div>
              );
            })
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada permintaan masuk.
            </p>
          )}
        </div>

        {completedRequests.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-bold text-zinc-900">Selesai ({completedRequests.length})</h2>
            <div className="space-y-1.5">
              {completedRequests.map((r) => {
                const toLoc = locationById.get(r.to_location_id);
                return (
                  <div key={r.id} className="rounded-lg border border-zinc-100 bg-white px-3 py-2 text-xs text-zinc-500">
                    {r.request_number} — ke {toLoc?.name ?? "—"} · {formatDateTime(r.created_at)}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Sisi peminta (Kitchen/Bar, atau lokasi lain) -- perlu minimal 1 Gudang
  // standalone di bisnis ini buat jadi tujuan permintaan.
  const warehouseLocations = (allLocations ?? []).filter(
    (l) => l.is_default_purchase && !l.is_production && l.warehouse_mode === "standalone",
  );
  const primaryWarehouse = warehouseLocations[0];

  if (!primaryWarehouse) {
    return (
      <div className="w-full max-w-2xl">
        <h1 className="text-lg font-bold text-zinc-900">Permintaan Gudang</h1>
        <p className="mt-2 rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
          Belum ada lokasi Gudang dengan mode &quot;Berdiri Sendiri&quot; di bisnis ini.
        </p>
      </div>
    );
  }

  const [{ data: warehouseItemRows }, myRequestRows, { data: incomingDnRows }, ingredientRows] = await Promise.all([
    supabase
      .from("warehouse_items")
      .select("name")
      .eq("business_id", businessId)
      .eq("location_id", primaryWarehouse.id)
      .order("name", { ascending: true }),
    fetchAllRows<{ id: string; request_number: string; note: string | null; created_at: string }>((from, to) =>
      supabase
        .from("warehouse_requests")
        .select("id, request_number, note, created_at")
        .eq("business_id", businessId)
        .eq("to_location_id", locationId)
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
    supabase
      .from("warehouse_delivery_notes")
      .select("id, dn_number, from_location_id, prepared_by, created_at")
      .eq("business_id", businessId)
      .eq("to_location_id", locationId)
      .order("created_at", { ascending: false }),
    fetchAllRows<{ id: string; name: string; unit: string }>((from, to) =>
      supabase
        .from("ingredients")
        .select("id, name, unit")
        .eq("business_id", businessId)
        .is("deleted_at", null)
        .range(from, to),
    ),
  ]);

  const warehouseItemNames = (warehouseItemRows ?? []).map((r) => r.name);
  const ingredientNames = ingredientRows.map((i) => i.name);
  const ingredientByName = new Map(ingredientRows.map((i) => [i.name.toLowerCase(), { id: i.id, unit: i.unit }]));

  const myRequestIds = myRequestRows.map((r) => r.id);
  const myRequestItemRows =
    myRequestIds.length > 0
      ? await fetchAllRows<{ warehouse_request_id: string; item_name: string; unit: string | null; qty_requested: number; qty_sent: number }>(
          (from, to) =>
            supabase
              .from("warehouse_request_items")
              .select("warehouse_request_id, item_name, unit, qty_requested, qty_sent")
              .in("warehouse_request_id", myRequestIds)
              .range(from, to),
        )
      : [];
  const myItemsByRequest = new Map<string, typeof myRequestItemRows>();
  for (const it of myRequestItemRows) {
    const list = myItemsByRequest.get(it.warehouse_request_id) ?? [];
    list.push(it);
    myItemsByRequest.set(it.warehouse_request_id, list);
  }

  const dnIds = (incomingDnRows ?? []).map((d) => d.id);
  const dnItemRows =
    dnIds.length > 0
      ? await fetchAllRows<{
          id: string;
          delivery_note_id: string;
          item_name: string;
          unit: string | null;
          qty: number;
          received_at: string | null;
          received_by: string | null;
        }>((from, to) =>
          supabase
            .from("warehouse_delivery_note_items")
            .select("id, delivery_note_id, item_name, unit, qty, received_at, received_by")
            .in("delivery_note_id", dnIds)
            .range(from, to),
        )
      : [];
  const dnItemsByDn = new Map<string, typeof dnItemRows>();
  for (const it of dnItemRows) {
    const list = dnItemsByDn.get(it.delivery_note_id) ?? [];
    list.push(it);
    dnItemsByDn.set(it.delivery_note_id, list);
  }

  return (
    <div className="w-full max-w-2xl">
      <p className="text-xs text-zinc-400">
        <Link href={`/business/${businessId}/lokasi/${locationId}/bahan-baku`} className="hover:text-brand-600 hover:underline">
          Bahan Baku
        </Link>{" "}
        · Permintaan Gudang
      </p>
      <h1 className="mt-1 text-lg font-bold text-zinc-900">Permintaan Gudang — {location.name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Minta barang dari {primaryWarehouse.name}, lalu tambahkan sendiri ke stok bahan baku {location.name} saat
        Surat Jalan-nya sudah sampai fisik.
      </p>

      <div className="mt-4">
        <RequestForm
          warehouseItemNames={warehouseItemNames}
          employees={employees}
          action={submitWarehouseRequest.bind(null, businessId, primaryWarehouse.id, locationId)}
        />
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-bold text-zinc-900">Surat Jalan Masuk</h2>
        {(incomingDnRows ?? []).length > 0 ? (
          <div className="space-y-2">
            {(incomingDnRows ?? []).map((dn) => {
              const items = dnItemsByDn.get(dn.id) ?? [];
              return (
                <div key={dn.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-900">{dn.dn_number}</p>
                    <p className="text-[11px] text-zinc-400">{formatDateTime(dn.created_at)}</p>
                  </div>
                  <p className="text-[11px] text-zinc-400">Disiapkan oleh {dn.prepared_by}</p>
                  <ul className="mt-2 space-y-1.5">
                    {items.map((it) => (
                      <li key={it.id} className="text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-700">
                            {it.item_name} — {Number(it.qty)} {it.unit}
                          </span>
                          {it.received_at ? (
                            <span className="text-[11px] text-brand-600">✓ sudah ditambahkan ({it.received_by})</span>
                          ) : (
                            <ReceiveItemForm
                              dnItemId={it.id}
                              ingredientNames={ingredientNames}
                              ingredientByName={ingredientByName}
                              employees={employees}
                              action={receiveWarehouseDeliveryNoteItem.bind(null, businessId, it.id, locationId)}
                            />
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Belum ada Surat Jalan masuk.
          </p>
        )}
      </div>

      {myRequestRows.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-bold text-zinc-900">Riwayat Permintaan Saya</h2>
          <div className="space-y-2">
            {myRequestRows.map((r) => (
              <div key={r.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-900">{r.request_number}</p>
                  <p className="text-[11px] text-zinc-400">{formatDateTime(r.created_at)}</p>
                </div>
                <ul className="mt-1 space-y-0.5 text-xs text-zinc-600">
                  {(myItemsByRequest.get(r.id) ?? []).map((it, idx) => (
                    <li key={idx}>
                      • {it.item_name} — diminta {Number(it.qty_requested)} {it.unit}, dikirim{" "}
                      {Number(it.qty_sent)} {it.unit}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
